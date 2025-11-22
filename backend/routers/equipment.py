from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import Equipment, EquipmentHistory, UserActivity, User, UserRole
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import Equipment, EquipmentHistory, UserActivity, User, UserRole
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/equipment", tags=["equipment"])

class EquipmentCreate(BaseModel):
    equipment_type: str
    passport_number: str
    load_capacity: Optional[float] = None
    manufacturer: Optional[str] = None
    installation_date: Optional[datetime] = None
    pto_date: Optional[datetime] = None
    cto_date: Optional[datetime] = None
    installation_location: Optional[str] = None

class EquipmentUpdate(BaseModel):
    equipment_type: Optional[str] = None
    passport_number: Optional[str] = None
    load_capacity: Optional[float] = None
    manufacturer: Optional[str] = None
    installation_date: Optional[datetime] = None
    pto_date: Optional[datetime] = None
    cto_date: Optional[datetime] = None
    installation_location: Optional[str] = None
    status: Optional[str] = None

class EquipmentResponse(BaseModel):
    id: int
    equipment_type: str
    passport_number: str
    load_capacity: Optional[float]
    manufacturer: Optional[str]
    installation_date: Optional[datetime]
    pto_date: Optional[datetime]
    cto_date: Optional[datetime]
    installation_location: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("", response_model=List[EquipmentResponse])
async def get_equipment_list(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    equipment_type: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список оборудования"""
    await require_permission(current_user, "equipment:read", db)
    
    query = select(Equipment)
    
    if search:
        query = query.where(
            or_(
                Equipment.passport_number.ilike(f"%{search}%"),
                Equipment.equipment_type.ilike(f"%{search}%"),
                Equipment.installation_location.ilike(f"%{search}%")
            )
        )
    
    if equipment_type:
        query = query.where(Equipment.equipment_type == equipment_type)
    
    if status:
        query = query.where(Equipment.status == status)
    
    query = query.order_by(Equipment.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    equipment_list = result.scalars().all()
    
    return [
        EquipmentResponse(
            id=eq.id,
            equipment_type=eq.equipment_type,
            passport_number=eq.passport_number,
            load_capacity=eq.load_capacity,
            manufacturer=eq.manufacturer,
            installation_date=eq.installation_date,
            pto_date=eq.pto_date,
            cto_date=eq.cto_date,
            installation_location=eq.installation_location,
            status=eq.status,
            created_at=eq.created_at,
            updated_at=eq.updated_at,
        )
        for eq in equipment_list
    ]

@router.get("/{equipment_id}", response_model=EquipmentResponse)
async def get_equipment(
    equipment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить оборудование по ID"""
    await require_permission(current_user, "equipment:read", db)
    
    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    equipment = result.scalar_one_or_none()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    return EquipmentResponse(
        id=equipment.id,
        equipment_type=equipment.equipment_type,
        passport_number=equipment.passport_number,
        load_capacity=equipment.load_capacity,
        manufacturer=equipment.manufacturer,
        installation_date=equipment.installation_date,
        pto_date=equipment.pto_date,
        cto_date=equipment.cto_date,
        installation_location=equipment.installation_location,
        status=equipment.status,
        created_at=equipment.created_at,
        updated_at=equipment.updated_at,
    )

@router.post("", response_model=EquipmentResponse, status_code=status.HTTP_201_CREATED)
async def create_equipment(
    equipment_data: EquipmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новое оборудование"""
    try:
        logger.debug(f"Creating equipment for user {current_user.id}")
        
        # Проверка прав - используем уже загруженные роли из get_current_user
        # get_current_user уже загружает роли через selectinload
        user_roles = []
        try:
            # Пробуем получить роли из уже загруженного объекта
            if hasattr(current_user, 'roles') and current_user.roles:
                user_roles = [ur.role.name for ur in current_user.roles]
        except Exception as e:
            logger.warning(f"Error getting roles from current_user: {e}")
            # Если не получилось, загружаем заново
            result = await db.execute(
                select(User)
                .options(selectinload(User.roles).selectinload(UserRole.role))
                .where(User.id == current_user.id)
            )
            user_with_roles = result.scalar_one()
            user_roles = [ur.role.name for ur in user_with_roles.roles]
        
        logger.debug(f"User roles: {user_roles}")
        
        # Админ имеет все права - пропускаем проверку
        if "admin" in user_roles:
            logger.debug("User is admin, skipping permission check")
        else:
            logger.debug("User is not admin, checking permissions")
            await require_permission(current_user, "equipment:create", db)
        
        logger.debug(f"Checking passport number: {equipment_data.passport_number}")
        # Проверка уникальности паспорта
        result = await db.execute(
            select(Equipment).where(Equipment.passport_number == equipment_data.passport_number)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Passport number already exists")
        
        logger.debug("Creating equipment object")
        new_equipment = Equipment(
            **equipment_data.dict(),
            created_by=current_user.id,
            status="active"  # По умолчанию активное
        )
        db.add(new_equipment)
        logger.debug("Flushing to database")
        await db.flush()
        logger.info(f"Equipment created with ID: {new_equipment.id}")
        
        # Логирование
        logger.debug("Creating activity log")
        activity = UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="equipment",
            entity_id=new_equipment.id,
            description=f"Created equipment {new_equipment.passport_number}"
        )
        db.add(activity)
        
        logger.debug("Committing to database")
        await db.commit()
        logger.debug("Refreshing equipment")
        await db.refresh(new_equipment)
        logger.info("Equipment saved successfully")
        
        return EquipmentResponse(
            id=new_equipment.id,
            equipment_type=new_equipment.equipment_type,
            passport_number=new_equipment.passport_number,
            load_capacity=new_equipment.load_capacity,
            manufacturer=new_equipment.manufacturer,
            installation_date=new_equipment.installation_date,
            pto_date=new_equipment.pto_date,
            cto_date=new_equipment.cto_date,
            installation_location=new_equipment.installation_location,
            status=new_equipment.status,
            created_at=new_equipment.created_at,
            updated_at=new_equipment.updated_at,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating equipment: {e}", exc_info=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.put("/{equipment_id}", response_model=EquipmentResponse)
async def update_equipment(
    equipment_id: int,
    equipment_data: EquipmentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить оборудование"""
    await require_permission(current_user, "equipment:update", db)
    
    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    equipment = result.scalar_one_or_none()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    # Сохранение истории изменений
    update_data = equipment_data.dict(exclude_unset=True)
    for field, new_value in update_data.items():
        if hasattr(equipment, field):
            old_value = getattr(equipment, field)
            if old_value != new_value:
                history = EquipmentHistory(
                    equipment_id=equipment.id,
                    changed_by=current_user.id,
                    field_name=field,
                    old_value=str(old_value) if old_value else None,
                    new_value=str(new_value) if new_value else None
                )
                db.add(history)
                setattr(equipment, field, new_value)
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="equipment",
        entity_id=equipment.id,
        description=f"Updated equipment {equipment.passport_number}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(equipment)
    
    return EquipmentResponse(
        id=equipment.id,
        equipment_type=equipment.equipment_type,
        passport_number=equipment.passport_number,
        load_capacity=equipment.load_capacity,
        manufacturer=equipment.manufacturer,
        installation_date=equipment.installation_date,
        pto_date=equipment.pto_date,
        cto_date=equipment.cto_date,
        installation_location=equipment.installation_location,
        status=equipment.status,
        created_at=equipment.created_at,
        updated_at=equipment.updated_at,
    )

@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_equipment(
    equipment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить оборудование"""
    await require_permission(current_user, "equipment:delete", db)
    
    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    equipment = result.scalar_one_or_none()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="equipment",
        entity_id=equipment.id,
        description=f"Deleted equipment {equipment.passport_number}"
    )
    db.add(activity)
    
    await db.delete(equipment)
    await db.commit()
    return None

@router.get("/{equipment_id}/history", response_model=List[dict])
async def get_equipment_history(
    equipment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить историю изменений оборудования"""
    await require_permission(current_user, "equipment:read", db)
    
    result = await db.execute(
        select(EquipmentHistory)
        .where(EquipmentHistory.equipment_id == equipment_id)
        .order_by(EquipmentHistory.created_at.desc())
    )
    history = result.scalars().all()
    
    return [
        {
            "id": h.id,
            "field_name": h.field_name,
            "old_value": h.old_value,
            "new_value": h.new_value,
            "changed_by": h.changed_by,
            "created_at": h.created_at.isoformat()
        }
        for h in history
    ]

