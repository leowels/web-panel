from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import SystemSettings, User, UserActivity
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
    from backend.utils import get_password_hash, verify_password
except ImportError:
    from ..models import SystemSettings, User, UserActivity
    from ..database import get_db
    from ..auth import get_current_user, require_permission
    from ..utils import get_password_hash, verify_password

router = APIRouter(prefix="/api/settings", tags=["settings"])

class UserSettingsUpdate(BaseModel):
    full_name: Optional[str] = None
    organization: Optional[str] = None
    signature: Optional[str] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class SystemSettingUpdate(BaseModel):
    value: str

@router.get("/user")
async def get_user_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить настройки пользователя"""
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "organization": user.organization,
        "signature": user.signature,
    }

@router.put("/user")
async def update_user_settings(
    settings: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить настройки пользователя"""
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    
    if settings.full_name is not None:
        user.full_name = settings.full_name
    if settings.organization is not None:
        user.organization = settings.organization
    if settings.signature is not None:
        user.signature = settings.signature
    
    await db.commit()
    await db.refresh(user)
    
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "organization": user.organization,
        "signature": user.signature,
    }

@router.post("/user/change-password")
async def change_user_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Смена пароля пользователя"""
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    
    if not verify_password(password_data.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    
    user.hashed_password = get_password_hash(password_data.new_password)
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="user",
        entity_id=user.id,
        description="Changed password"
    )
    db.add(activity)
    
    await db.commit()
    return {"message": "Password changed successfully"}

@router.get("/system")
async def get_system_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить системные настройки"""
    await require_permission(current_user, "settings:read", db)
    
    result = await db.execute(select(SystemSettings))
    settings = result.scalars().all()
    
    return {s.key: s.value for s in settings}

@router.get("/system/{key}")
async def get_system_setting(
    key: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить системную настройку по ключу"""
    await require_permission(current_user, "settings:read", db)
    
    result = await db.execute(select(SystemSettings).where(SystemSettings.key == key))
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    return {"key": setting.key, "value": setting.value, "description": setting.description}

@router.put("/system/{key}")
async def update_system_setting(
    key: str,
    setting_data: SystemSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить системную настройку"""
    await require_permission(current_user, "settings:update", db)
    
    result = await db.execute(select(SystemSettings).where(SystemSettings.key == key))
    setting = result.scalar_one_or_none()
    
    if not setting:
        # Создание новой настройки
        setting = SystemSettings(
            key=key,
            value=setting_data.value,
            updated_by=current_user.id
        )
        db.add(setting)
    else:
        setting.value = setting_data.value
        setting.updated_by = current_user.id
        setting.updated_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="settings",
        description=f"Updated system setting {key}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(setting)
    
    # Если обновлены AI настройки, очищаем кэш AI клиента
    if key.startswith("ai_"):
        try:
            from backend.ai_client import clear_ai_client_cache
        except ImportError:
            try:
                from ai_client import clear_ai_client_cache
            except ImportError:
                pass
        else:
            clear_ai_client_cache()
    
    return {"key": setting.key, "value": setting.value, "description": setting.description}

