from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import Permit, Equipment, User, UserActivity
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import Permit, Equipment, User, UserActivity
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/permits", tags=["permits"])

class PermitCreate(BaseModel):
    equipment_id: int
    work_type: str  # repair, maintenance, inspection, installation
    description: str
    responsible_person: str
    responsible_organization: Optional[str] = None
    safety_measures: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class PermitUpdate(BaseModel):
    work_type: Optional[str] = None
    description: Optional[str] = None
    responsible_person: Optional[str] = None
    responsible_organization: Optional[str] = None
    safety_measures: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    approval_notes: Optional[str] = None

class PermitStatusUpdate(BaseModel):
    status: str  # pending, approved, rejected, expired, completed
    approval_notes: Optional[str] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None

class PermitResponse(BaseModel):
    id: int
    permit_number: str
    equipment_id: int
    work_type: str
    description: str
    responsible_person: str
    responsible_organization: Optional[str]
    safety_measures: Optional[str]
    status: str
    requested_by: int
    approved_by: Optional[int]
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    actual_start: Optional[datetime]
    actual_end: Optional[datetime]
    approval_notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    # Связанные объекты
    equipment: Optional[dict] = None
    requester: Optional[dict] = None
    approver: Optional[dict] = None

    class Config:
        from_attributes = True

def _generate_permit_number() -> str:
    """Генерация номера разрешения"""
    from datetime import datetime
    import random
    now = datetime.now()
    return f"PRM-{now.year}{now.month:02d}{now.day:02d}-{random.randint(1000, 9999)}"

def _permit_to_response(permit: Permit) -> PermitResponse:
    """Преобразование Permit в PermitResponse"""
    equipment_data = None
    if hasattr(permit, 'equipment') and permit.equipment:
        equipment_data = {
            "id": permit.equipment.id,
            "equipment_type": permit.equipment.equipment_type,
            "passport_number": permit.equipment.passport_number,
            "position": permit.equipment.position,
            "workshop": permit.equipment.workshop
        }
    
    requester_data = None
    if hasattr(permit, 'requester') and permit.requester:
        requester_data = {
            "id": permit.requester.id,
            "username": permit.requester.username,
            "full_name": permit.requester.full_name
        }
    
    approver_data = None
    if hasattr(permit, 'approver') and permit.approver:
        approver_data = {
            "id": permit.approver.id,
            "username": permit.approver.username,
            "full_name": permit.approver.full_name
        }
    
    return PermitResponse(
        id=permit.id,
        permit_number=permit.permit_number,
        equipment_id=permit.equipment_id,
        work_type=permit.work_type,
        description=permit.description,
        responsible_person=permit.responsible_person,
        responsible_organization=permit.responsible_organization,
        safety_measures=permit.safety_measures,
        status=permit.status,
        requested_by=permit.requested_by,
        approved_by=permit.approved_by,
        start_date=permit.start_date,
        end_date=permit.end_date,
        actual_start=permit.actual_start,
        actual_end=permit.actual_end,
        approval_notes=permit.approval_notes,
        created_at=permit.created_at,
        updated_at=permit.updated_at,
        equipment=equipment_data,
        requester=requester_data,
        approver=approver_data
    )

@router.get("", response_model=List[PermitResponse])
async def get_permits(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[str] = None,
    work_type: Optional[str] = None,
    equipment_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список разрешений"""
    await require_permission(current_user, "permits:read", db)
    
    query = select(Permit).options(
        selectinload(Permit.equipment),
        selectinload(Permit.requester),
        selectinload(Permit.approver)
    )
    
    if status:
        query = query.where(Permit.status == status)
    
    if work_type:
        query = query.where(Permit.work_type == work_type)
    
    if equipment_id:
        query = query.where(Permit.equipment_id == equipment_id)
    
    query = query.order_by(Permit.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    permits = result.scalars().all()
    
    return [_permit_to_response(permit) for permit in permits]

@router.get("/{permit_id}", response_model=PermitResponse)
async def get_permit(
    permit_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить разрешение по ID"""
    await require_permission(current_user, "permits:read", db)
    
    result = await db.execute(
        select(Permit)
        .options(
            selectinload(Permit.equipment),
            selectinload(Permit.requester),
            selectinload(Permit.approver)
        )
        .where(Permit.id == permit_id)
    )
    permit = result.scalar_one_or_none()
    
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    
    return _permit_to_response(permit)

@router.post("", response_model=PermitResponse, status_code=status.HTTP_201_CREATED)
async def create_permit(
    permit_data: PermitCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новое разрешение на работы"""
    await require_permission(current_user, "permits:create", db)
    
    # Проверяем существование оборудования
    eq_result = await db.execute(select(Equipment).where(Equipment.id == permit_data.equipment_id))
    equipment = eq_result.scalar_one_or_none()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    # Валидация типа работ
    valid_work_types = ["repair", "maintenance", "inspection", "installation"]
    if permit_data.work_type not in valid_work_types:
        raise HTTPException(status_code=400, detail=f"Invalid work_type. Must be one of: {valid_work_types}")
    
    # Генерируем уникальный номер разрешения
    permit_number = _generate_permit_number()
    
    # Проверяем уникальность номера
    while True:
        existing = await db.execute(select(Permit).where(Permit.permit_number == permit_number))
        if not existing.scalar_one_or_none():
            break
        permit_number = _generate_permit_number()
    
    new_permit = Permit(
        permit_number=permit_number,
        equipment_id=permit_data.equipment_id,
        work_type=permit_data.work_type,
        description=permit_data.description,
        responsible_person=permit_data.responsible_person,
        responsible_organization=permit_data.responsible_organization,
        safety_measures=permit_data.safety_measures,
        requested_by=current_user.id,
        start_date=permit_data.start_date,
        end_date=permit_data.end_date,
        status="pending"
    )
    db.add(new_permit)
    await db.flush()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="permit",
        entity_id=new_permit.id,
        description=f"Created permit {new_permit.permit_number} for equipment {equipment.passport_number}"
    )
    db.add(activity)
    
    await db.commit()
    
    # Загружаем созданное разрешение со связанными объектами
    result = await db.execute(
        select(Permit)
        .options(
            selectinload(Permit.equipment),
            selectinload(Permit.requester),
            selectinload(Permit.approver)
        )
        .where(Permit.id == new_permit.id)
    )
    created_permit = result.scalar_one()
    
    return _permit_to_response(created_permit)

@router.put("/{permit_id}", response_model=PermitResponse)
async def update_permit(
    permit_id: int,
    permit_data: PermitUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить разрешение"""
    await require_permission(current_user, "permits:update", db)
    
    result = await db.execute(select(Permit).where(Permit.id == permit_id))
    permit = result.scalar_one_or_none()
    
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    
    # Проверяем, можно ли редактировать разрешение
    if permit.status in ["approved", "completed", "expired"]:
        raise HTTPException(status_code=400, detail="Cannot edit permit in current status")
    
    # Валидация типа работ если обновляется
    if permit_data.work_type:
        valid_work_types = ["repair", "maintenance", "inspection", "installation"]
        if permit_data.work_type not in valid_work_types:
            raise HTTPException(status_code=400, detail=f"Invalid work_type. Must be one of: {valid_work_types}")
    
    update_data = permit_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(permit, field, value)
    
    permit.updated_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="permit",
        entity_id=permit.id,
        description=f"Updated permit {permit.permit_number}"
    )
    db.add(activity)
    
    await db.commit()
    
    # Загружаем обновленное разрешение со связанными объектами
    result = await db.execute(
        select(Permit)
        .options(
            selectinload(Permit.equipment),
            selectinload(Permit.requester),
            selectinload(Permit.approver)
        )
        .where(Permit.id == permit.id)
    )
    updated_permit = result.scalar_one()
    
    return _permit_to_response(updated_permit)

@router.post("/{permit_id}/status", response_model=PermitResponse)
async def update_permit_status(
    permit_id: int,
    status_data: PermitStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить статус разрешения"""
    await require_permission(current_user, "permits:approve", db)
    
    valid_statuses = ["pending", "approved", "rejected", "expired", "completed"]
    if status_data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.execute(select(Permit).where(Permit.id == permit_id))
    permit = result.scalar_one_or_none()
    
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    
    old_status = permit.status
    permit.status = status_data.status
    permit.updated_at = datetime.utcnow()
    
    # Обновляем поля в зависимости от статуса
    if status_data.status in ["approved", "rejected"]:
        permit.approved_by = current_user.id
        if status_data.approval_notes:
            permit.approval_notes = status_data.approval_notes
    
    if status_data.actual_start:
        permit.actual_start = status_data.actual_start
    
    if status_data.actual_end:
        permit.actual_end = status_data.actual_end
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="permit",
        entity_id=permit.id,
        description=f"Changed permit {permit.permit_number} status from {old_status} to {status_data.status}"
    )
    db.add(activity)
    
    await db.commit()
    
    # Загружаем обновленное разрешение со связанными объектами
    result = await db.execute(
        select(Permit)
        .options(
            selectinload(Permit.equipment),
            selectinload(Permit.requester),
            selectinload(Permit.approver)
        )
        .where(Permit.id == permit.id)
    )
    updated_permit = result.scalar_one()
    
    return _permit_to_response(updated_permit)

@router.delete("/{permit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_permit(
    permit_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить разрешение"""
    await require_permission(current_user, "permits:delete", db)
    
    result = await db.execute(select(Permit).where(Permit.id == permit_id))
    permit = result.scalar_one_or_none()
    
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    
    # Проверяем, можно ли удалить разрешение
    if permit.status in ["approved", "completed"]:
        raise HTTPException(status_code=400, detail="Cannot delete permit in current status")
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="permit",
        entity_id=permit.id,
        description=f"Deleted permit {permit.permit_number}"
    )
    db.add(activity)
    
    await db.delete(permit)
    await db.commit()
    return None
