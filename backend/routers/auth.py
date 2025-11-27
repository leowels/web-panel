from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta
import secrets

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import User, UserActivity, UserRole, RefreshToken
    from backend.database import get_db
    from backend.auth import create_access_token, get_current_user
    from backend.utils import verify_password, get_password_hash
except ImportError:
    from ..models import User, UserActivity, UserRole, RefreshToken
    from ..database import get_db
    from ..auth import create_access_token, get_current_user
    from ..utils import verify_password, get_password_hash

router = APIRouter(prefix="/api/auth", tags=["auth"])

class UserLogin(BaseModel):
    username: str
    password: str
    # telegram_user_id: Optional[str] = None  # ВРЕМЕННО ОТКЛЮЧЕНО

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
    refresh_token: str

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

async def create_refresh_token(user_id: int, db: AsyncSession) -> str:
    """Создать refresh токен"""
    # Удаляем старые токены пользователя
    await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == user_id)
    )
    old_tokens = await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == user_id)
    )
    for token in old_tokens.scalars().all():
        await db.delete(token)
    
    # Создаем новый токен
    token_value = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=30)  # 30 дней
    
    refresh_token = RefreshToken(
        token=token_value,
        user_id=user_id,
        expires_at=expires_at
    )
    db.add(refresh_token)
    await db.flush()
    
    return token_value

@router.post("/login", response_model=Token)
async def login(
    user_data: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Вход в систему (обычный или через Telegram)"""
    import logging
    logger = logging.getLogger(__name__)
    
    user = None
    
    # Обычный вход (Telegram временно отключен)
    if user_data.username and user_data.password:
        # Обычный вход
        logger.info(f"Попытка обычного входа для пользователя: {user_data.username}")
    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.username == user_data.username)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        logger.warning(f"Попытка входа с несуществующим username: {user_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not verify_password(user_data.password, user.hashed_password):
        logger.warning(f"Неверный пароль для пользователя: {user_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Telegram функции временно отключены
        
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    
    # Обновление last_login
    user.last_login = datetime.utcnow()
    
    # Создаем токены
    access_token = create_access_token(data={"sub": user.username})
    refresh_token = await create_refresh_token(user.id, db)
    
    # Логирование входа
    login_method = "password"
    activity = UserActivity(
        user_id=user.id,
        action_type="login",
        description=f"User {user.username} logged in via {login_method}",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    db.add(activity)
    
    await db.commit()
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 3600,  # 1 час
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email
        }
    }

@router.post("/register", response_model=Token)
async def register(
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """Регистрация нового пользователя"""
    # Проверка существования
    result = await db.execute(
        select(User).where(
            (User.username == user_data.username) | (User.email == user_data.email)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already registered")
    
    # Создание пользователя
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        is_active=True
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    # Создаем токены
    access_token = create_access_token(data={"sub": new_user.username})
    refresh_token = await create_refresh_token(new_user.id, db)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "full_name": new_user.full_name,
            "email": new_user.email
        }
    }

@router.post("/refresh", response_model=Token)
async def refresh_token(
    token_data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """Обновление access токена через refresh токен"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Ищем refresh токен
    result = await db.execute(
        select(RefreshToken)
        .options(selectinload(RefreshToken.user).selectinload(User.roles).selectinload(UserRole.role))
        .where(RefreshToken.token == token_data.refresh_token)
    )
    refresh_token_obj = result.scalar_one_or_none()
    
    if not refresh_token_obj:
        logger.warning(f"Попытка использования несуществующего refresh токена")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Проверяем срок действия
    if refresh_token_obj.expires_at < datetime.utcnow():
        logger.warning(f"Попытка использования просроченного refresh токена")
        await db.delete(refresh_token_obj)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Проверяем, не отозван ли токен
    if refresh_token_obj.is_revoked:
        logger.warning(f"Попытка использования отозванного refresh токена")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = refresh_token_obj.user
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    
    # Создаем новые токены
    new_access_token = create_access_token(data={"sub": user.username})
    new_refresh_token = await create_refresh_token(user.id, db)
    
    # Логирование
    activity = UserActivity(
        user_id=user.id,
        action_type="token_refresh",
        description=f"Access token refreshed for user {user.username}"
    )
    db.add(activity)
    
    await db.commit()
    
    logger.info(f"Токены обновлены для пользователя: {user.username}")
    
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email
        }
    }

@router.get("/me", response_model=UserMeResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить информацию о текущем пользователе"""
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
        roles=[{"id": ur.role.id, "name": ur.role.name} for ur in user.roles]
    )

