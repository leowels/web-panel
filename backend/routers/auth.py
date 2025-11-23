from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import User, UserActivity, UserRole
    from backend.database import get_db
    from backend.auth import create_access_token, get_current_user
    from backend.utils import verify_password, get_password_hash
except ImportError:
    from ..models import User, UserActivity, UserRole
    from ..database import get_db
    from ..auth import create_access_token, get_current_user
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
    token_type: str

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

@router.post("/login", response_model=Token)
async def login(
    user_data: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Вход в систему"""
    import logging
    logger = logging.getLogger(__name__)
    
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
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    
    # Обновление last_login
    user.last_login = datetime.utcnow()
    
    # Логирование входа
    activity = UserActivity(
        user_id=user.id,
        action_type="login",
        description=f"User {user.username} logged in",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    db.add(activity)
    
    await db.commit()
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

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
    
    access_token = create_access_token(data={"sub": user_data.username})
    return {"access_token": access_token, "token_type": "bearer"}

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

