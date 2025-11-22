from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os
from typing import Optional

# Поддержка запуска как скрипта и как модуля
try:
    from .models import User, Role, UserRole
    from .database import get_db
    from .utils import verify_password
except ImportError:
    from models import User, Role, UserRole
    from database import get_db
    from utils import verify_password

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    import sys
    print("ERROR: SECRET_KEY environment variable is not set!")
    print("Please set SECRET_KEY in your .env file before running in production.")
    sys.exit(1)

ALGORITHM = "HS256"
# Срок жизни токена - можно настроить через переменную окружения
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # По умолчанию 1 день (24 часа)

security = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        if not token:
            raise credentials_exception
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError as e:
        # Логируем ошибку для отладки
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"JWT validation error: {str(e)}")
        raise credentials_exception
    
    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.username == username)
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"User not found: {username}")
        raise credentials_exception
    
    if not user.is_active:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"User is inactive: {username}")
        raise credentials_exception
    
    return user

async def require_permission(user: User, permission: str, db: AsyncSession):
    """Проверка прав доступа"""
    # Если у пользователя нет ролей, запрещаем доступ
    if not user.roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: {permission}. User has no roles assigned."
        )
    
    # Админ имеет все права
    user_roles = [ur.role.name for ur in user.roles]
    if "admin" in user_roles:
        return
    
    # Проверка прав по ролям
    result = await db.execute(
        select(Role).where(Role.name.in_(user_roles))
    )
    roles = result.scalars().all()
    
    for role in roles:
        if not role.permissions:
            continue
        
        # Проверка на "*" (все права)
        if "*" in role.permissions:
            return
        
        # Проверка точного совпадения
        if permission in role.permissions:
            return
        
        # Проверка на wildcard (например, "inspections:*" для "inspections:read")
        permission_parts = permission.split(":")
        if len(permission_parts) == 2:
            resource, action = permission_parts
            wildcard_permission = f"{resource}:*"
            if wildcard_permission in role.permissions:
                return
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Permission denied: {permission}"
    )

async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

