from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta
import secrets
import os

# Support running as module and script
try:
    from backend.models import User, UserActivity, UserRole, RefreshToken
    from backend.database import get_db
    from backend.auth import create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
    from backend.utils import verify_password, get_password_hash
except ImportError:
    from ..models import User, UserActivity, UserRole, RefreshToken
    from ..database import get_db
    from ..auth import create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
    from ..utils import verify_password, get_password_hash

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserLogin(BaseModel):
    username: str
    password: str


class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: dict


class RefreshTokenRequest(BaseModel):
    refresh_token: Optional[str] = None


class UserMeResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    organization: Optional[str]
    is_active: bool
    roles: List[dict] = []

    class Config:
        from_attributes = True


def _refresh_days() -> int:
    return int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "14"))


def _set_refresh_cookie(response: Response, refresh_token: str):
    secure_cookie = os.getenv("JWT_COOKIE_SECURE", "false").lower() == "true"
    same_site = os.getenv("JWT_COOKIE_SAMESITE", "lax")
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure_cookie,
        samesite=same_site,
        max_age=_refresh_days() * 24 * 60 * 60,
        path="/",
    )


def _clear_refresh_cookie(response: Response):
    response.delete_cookie(key="refresh_token", path="/")


def _extract_refresh_token(request: Request, token_data: Optional[RefreshTokenRequest]) -> Optional[str]:
    token_from_body = token_data.refresh_token if token_data else None
    token_from_cookie = request.cookies.get("refresh_token")
    return token_from_body or token_from_cookie


async def create_refresh_token(user_id: int, db: AsyncSession) -> str:
    """Create refresh token and revoke old ones for rotation."""
    old_tokens = await db.execute(select(RefreshToken).where(RefreshToken.user_id == user_id))
    for token in old_tokens.scalars().all():
        token.is_revoked = True

    token_value = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=_refresh_days())

    refresh_token = RefreshToken(
        token=token_value,
        user_id=user_id,
        expires_at=expires_at,
        is_revoked=False,
    )
    db.add(refresh_token)
    await db.flush()
    return token_value


@router.post("/login", response_model=Token)
async def login(
    user_data: UserLogin,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    import logging

    logger = logging.getLogger(__name__)

    if not user_data.username or not user_data.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required",
        )

    logger.info("Login attempt for user: %s", user_data.username)

    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.username == user_data.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

    user.last_login = datetime.utcnow()

    access_token = create_access_token(data={"sub": user.username})
    refresh_token = await create_refresh_token(user.id, db)
    _set_refresh_cookie(response, refresh_token)

    activity = UserActivity(
        user_id=user.id,
        action_type="login",
        description=f"User {user.username} logged in via password",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(activity)

    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
        },
    }


@router.post("/register", response_model=Token)
async def register(
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db),
):
    """Registration is disabled. Users are created by admin."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Registration is disabled",
    )

    result = await db.execute(
        select(User).where((User.username == user_data.username) | (User.email == user_data.email))
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already registered")

    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    access_token = create_access_token(data={"sub": new_user.username})
    refresh_token = await create_refresh_token(new_user.id, db)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "full_name": new_user.full_name,
            "email": new_user.email,
        },
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(
    response: Response,
    request: Request,
    token_data: Optional[RefreshTokenRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using body token or HttpOnly cookie."""
    import logging

    logger = logging.getLogger(__name__)
    refresh_token_value = _extract_refresh_token(request, token_data)

    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(
        select(RefreshToken)
        .options(selectinload(RefreshToken.user).selectinload(User.roles).selectinload(UserRole.role))
        .where(RefreshToken.token == refresh_token_value)
    )
    refresh_token_obj = result.scalar_one_or_none()

    if not refresh_token_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if refresh_token_obj.expires_at < datetime.utcnow():
        refresh_token_obj.is_revoked = True
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if refresh_token_obj.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = refresh_token_obj.user
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

    new_access_token = create_access_token(data={"sub": user.username})
    new_refresh_token = await create_refresh_token(user.id, db)
    _set_refresh_cookie(response, new_refresh_token)

    activity = UserActivity(
        user_id=user.id,
        action_type="token_refresh",
        description=f"Access token refreshed for user {user.username}",
    )
    db.add(activity)

    await db.commit()
    logger.info("Tokens refreshed for user: %s", user.username)

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
        },
    }


@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    token_data: Optional[RefreshTokenRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Logout and revoke current refresh token."""
    refresh_token_value = _extract_refresh_token(request, token_data)

    if refresh_token_value:
        result = await db.execute(select(RefreshToken).where(RefreshToken.token == refresh_token_value))
        token_obj = result.scalar_one_or_none()
        if token_obj:
            token_obj.is_revoked = True
            await db.commit()

    _clear_refresh_cookie(response)
    return {"status": "ok"}


@router.get("/me", response_model=UserMeResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user profile."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.id == current_user.id)
    )
    user = result.scalar_one()

    return UserMeResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        organization=user.organization,
        is_active=user.is_active,
        roles=[{"id": ur.role.id, "name": ur.role.name} for ur in user.roles],
    )
