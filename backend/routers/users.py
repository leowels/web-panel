from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import User, Role, UserRole, UserActivity, Base
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
    from backend.utils import get_password_hash, verify_password
except ImportError:
    from ..models import User, Role, UserRole, UserActivity, Base
    from ..database import get_db
    from ..auth import get_current_user, require_permission
    from ..utils import get_password_hash, verify_password

router = APIRouter(prefix="/api/users", tags=["users"])

# Pydantic схемы
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    organization: Optional[str] = None
    role_ids: List[int] = []

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    organization: Optional[str] = None
    signature: Optional[str] = None
    is_active: Optional[bool] = None
    role_ids: Optional[List[int]] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    organization: Optional[str]
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]
    roles: List[dict] = []

    class Config:
        from_attributes = True

class UserActivityResponse(BaseModel):
    id: int
    action_type: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    description: Optional[str]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

# CRUD операции
@router.get("", response_model=List[UserResponse])
async def get_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список пользователей"""
    await require_permission(current_user, "users:read", db)
    
    query = select(User).options(selectinload(User.roles).selectinload(UserRole.role))
    
    if search:
        query = query.where(
            or_(
                User.username.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.full_name.ilike(f"%{search}%")
            )
        )
    
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()
    
    return [
        UserResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            organization=u.organization,
            is_active=u.is_active,
            created_at=u.created_at,
            last_login=u.last_login,
            roles=[{"id": ur.role.id, "name": ur.role.name} for ur in u.roles]
        )
        for u in users
    ]

@router.get("/me", response_model=UserResponse)
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
    
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        organization=user.organization,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        roles=[{"id": ur.role.id, "name": ur.role.name} for ur in user.roles]
    )

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить пользователя по ID"""
    await require_permission(current_user, "users:read", db)
    
    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        organization=user.organization,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        roles=[{"id": ur.role.id, "name": ur.role.name} for ur in user.roles]
    )

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать нового пользователя"""
    await require_permission(current_user, "users:create", db)
    
    # Проверка существования
    result = await db.execute(
        select(User).where(
            or_(User.username == user_data.username, User.email == user_data.email)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already exists")
    
    # Создание пользователя
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        organization=user_data.organization,
        is_active=True
    )
    db.add(new_user)
    await db.flush()
    
    # Назначение ролей
    if user_data.role_ids:
        roles_result = await db.execute(
            select(Role).where(Role.id.in_(user_data.role_ids))
        )
        roles = roles_result.scalars().all()
        
        for role in roles:
            user_role = UserRole(
                user_id=new_user.id,
                role_id=role.id,
                assigned_by=current_user.id
            )
            db.add(user_role)
    else:
        # Если роли не указаны, назначаем роль "inspector" по умолчанию
        inspector_role_result = await db.execute(
            select(Role).where(Role.name == "inspector")
        )
        inspector_role = inspector_role_result.scalar_one_or_none()
        
        if inspector_role:
            user_role = UserRole(
                user_id=new_user.id,
                role_id=inspector_role.id,
                assigned_by=current_user.id
            )
            db.add(user_role)
        else:
            # Если роли "inspector" нет, создаем роль "viewer" или используем первую доступную роль
            viewer_role_result = await db.execute(
                select(Role).where(Role.name == "viewer")
            )
            viewer_role = viewer_role_result.scalar_one_or_none()
            
            if viewer_role:
                user_role = UserRole(
                    user_id=new_user.id,
                    role_id=viewer_role.id,
                    assigned_by=current_user.id
                )
                db.add(user_role)
            else:
                # Если нет ни inspector, ни viewer, берем первую доступную роль
                any_role_result = await db.execute(select(Role).limit(1))
                any_role = any_role_result.scalar_one_or_none()
                if any_role:
                    user_role = UserRole(
                        user_id=new_user.id,
                        role_id=any_role.id,
                        assigned_by=current_user.id
                    )
                    db.add(user_role)
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="user",
        entity_id=new_user.id,
        description=f"Created user {new_user.username}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(new_user)
    
    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.id == new_user.id)
    )
    user = result.scalar_one()
    
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        organization=user.organization,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        roles=[{"id": ur.role.id, "name": ur.role.name} for ur in user.roles]
    )

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить пользователя"""
    await require_permission(current_user, "users:update", db)
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Обновление полей
    if user_data.username is not None:
        # Проверка уникальности
        check = await db.execute(
            select(User).where(and_(User.username == user_data.username, User.id != user_id))
        )
        if check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = user_data.username
    
    if user_data.email is not None:
        check = await db.execute(
            select(User).where(and_(User.email == user_data.email, User.id != user_id))
        )
        if check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already exists")
        user.email = user_data.email
    
    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    if user_data.organization is not None:
        user.organization = user_data.organization
    if user_data.signature is not None:
        user.signature = user_data.signature
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    
    # Обновление ролей
    if user_data.role_ids is not None:
        # Удаляем старые роли
        result_roles = await db.execute(
            select(UserRole).where(UserRole.user_id == user_id)
        )
        old_roles = result_roles.scalars().all()
        for ur in old_roles:
            await db.delete(ur)
        await db.flush()
        
        # Добавляем новые роли
        if user_data.role_ids:
            roles_result = await db.execute(
                select(Role).where(Role.id.in_(user_data.role_ids))
            )
            roles = roles_result.scalars().all()
            
            for role in roles:
                user_role = UserRole(
                    user_id=user.id,
                    role_id=role.id,
                    assigned_by=current_user.id
                )
                db.add(user_role)
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="user",
        entity_id=user.id,
        description=f"Updated user {user.username}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(user)
    
    result = await db.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.id == user.id)
    )
    updated_user = result.scalar_one()
    
    return UserResponse(
        id=updated_user.id,
        username=updated_user.username,
        email=updated_user.email,
        full_name=updated_user.full_name,
        organization=updated_user.organization,
        is_active=updated_user.is_active,
        created_at=updated_user.created_at,
        last_login=updated_user.last_login,
        roles=[{"id": ur.role.id, "name": ur.role.name} for ur in updated_user.roles]
    )

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить пользователя"""
    await require_permission(current_user, "users:delete", db)
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="user",
        entity_id=user.id,
        description=f"Deleted user {user.username}"
    )
    db.add(activity)
    
    await db.delete(user)
    await db.commit()
    return None

@router.post("/{user_id}/change-password")
async def change_password(
    user_id: int,
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Смена пароля"""
    # Пользователь может менять только свой пароль, админ - любой
    if user_id != current_user.id:
        await require_permission(current_user, "users:update", db)
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Проверка старого пароля (если меняет сам пользователь)
    if user_id == current_user.id:
        if not verify_password(password_data.old_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect old password")
    
    # Установка нового пароля
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

@router.get("/{user_id}/activity", response_model=List[UserActivityResponse])
async def get_user_activity(
    user_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    action_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить активность пользователя"""
    await require_permission(current_user, "users:read", db)
    
    query = select(UserActivity).where(UserActivity.user_id == user_id)
    
    if action_type:
        query = query.where(UserActivity.action_type == action_type)
    
    query = query.order_by(UserActivity.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    activities = result.scalars().all()
    
    return [
        UserActivityResponse(
            id=a.id,
            action_type=a.action_type,
            entity_type=a.entity_type,
            entity_id=a.entity_id,
            description=a.description,
            ip_address=a.ip_address,
            created_at=a.created_at
        )
        for a in activities
    ]

@router.get("/roles/list", response_model=List[dict])
async def get_roles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список всех ролей"""
    await require_permission(current_user, "users:read", db)
    
    result = await db.execute(select(Role))
    roles = result.scalars().all()
    
    return [{"id": r.id, "name": r.name, "description": r.description} for r in roles]

