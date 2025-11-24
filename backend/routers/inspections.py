from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import csv
import io

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import Inspection, InspectionAnswer, Equipment, ChecklistTemplate, UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import Inspection, InspectionAnswer, Equipment, ChecklistTemplate, UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/inspections", tags=["inspections"])

class InspectionAnswerCreate(BaseModel):
    item_id: int
    value: Optional[str] = None
    file_id: Optional[int] = None

class InspectionCreate(BaseModel):
    equipment_id: int
    checklist_template_id: int
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    notes: Optional[str] = None

class InspectionUpdate(BaseModel):
    status: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    notes: Optional[str] = None
    inspector_signature: Optional[str] = None

class InspectionAnswerResponse(BaseModel):
    id: int
    item_id: int
    value: Optional[str]
    file_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

class InspectionResponse(BaseModel):
    id: int
    equipment_id: int
    checklist_template_id: int
    inspector_id: int
    status: str
    location_lat: Optional[float]
    location_lng: Optional[float]
    inspector_signature: Optional[str]
    notes: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    is_synced: bool
    answers: List[InspectionAnswerResponse] = []

    class Config:
        from_attributes = True

@router.get("", response_model=List[InspectionResponse])
async def get_inspections(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    equipment_id: Optional[int] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список осмотров"""
    await require_permission(current_user, "inspections:read", db)
    
    query = select(Inspection).options(selectinload(Inspection.answers))
    
    # Фильтр по пользователю (если не админ)
    user_roles = [ur.role.name for ur in current_user.roles]
    if "admin" not in user_roles:
        query = query.where(Inspection.inspector_id == current_user.id)
    
    if equipment_id:
        query = query.where(Inspection.equipment_id == equipment_id)
    
    if status:
        query = query.where(Inspection.status == status)
    
    query = query.order_by(Inspection.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    inspections = result.scalars().all()
    
    return [
        InspectionResponse(
            id=i.id,
            equipment_id=i.equipment_id,
            checklist_template_id=i.checklist_template_id,
            inspector_id=i.inspector_id,
            status=i.status,
            location_lat=i.location_lat,
            location_lng=i.location_lng,
            inspector_signature=i.inspector_signature,
            notes=i.notes,
            started_at=i.started_at,
            completed_at=i.completed_at,
            created_at=i.created_at,
            updated_at=i.updated_at,
            is_synced=i.is_synced,
            answers=[
                InspectionAnswerResponse(
                    id=a.id,
                    item_id=a.item_id,
                    value=a.value,
                    file_id=a.file_id,
                    created_at=a.created_at,
                )
                for a in i.answers
            ]
        )
        for i in inspections
    ]


@router.get("/export")
async def export_inspections(
    equipment_id: Optional[int] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Экспорт осмотров в CSV"""
    await require_permission(current_user, "inspections:read", db)

    query = select(Inspection).options(
        selectinload(Inspection.equipment),
        selectinload(Inspection.checklist_template)
    )

    user_roles = [ur.role.name for ur in current_user.roles]
    if "admin" not in user_roles:
        query = query.where(Inspection.inspector_id == current_user.id)

    if equipment_id:
        query = query.where(Inspection.equipment_id == equipment_id)

    if status:
        query = query.where(Inspection.status == status)

    result = await db.execute(query.order_by(Inspection.updated_at.desc()))
    inspections = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id",
        "status",
        "equipment_passport",
        "workshop",
        "checklist",
        "inspector_id",
        "started_at",
        "completed_at",
        "notes",
        "updated_at",
    ])

    for inspection in inspections:
        equipment = inspection.equipment
        checklist = inspection.checklist_template
        writer.writerow([
            inspection.id,
            inspection.status,
            equipment.passport_number if equipment else "",
            equipment.workshop if equipment else "",
            checklist.name if checklist else inspection.checklist_template_id,
            inspection.inspector_id,
            inspection.started_at.isoformat() if inspection.started_at else "",
            inspection.completed_at.isoformat() if inspection.completed_at else "",
            (inspection.notes or "").replace("\n", " "),
            inspection.updated_at.isoformat() if inspection.updated_at else "",
        ])

    output.seek(0)
    filename = f"inspections_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "text/csv; charset=utf-8",
    }
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers=headers,
    )

@router.get("/{inspection_id}", response_model=InspectionResponse)
async def get_inspection(
    inspection_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить осмотр по ID"""
    await require_permission(current_user, "inspections:read", db)
    
    result = await db.execute(
        select(Inspection)
        .options(selectinload(Inspection.answers))
        .where(Inspection.id == inspection_id)
    )
    inspection = result.scalar_one_or_none()
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    # Проверка прав доступа
    user_roles = [ur.role.name for ur in current_user.roles]
    if "admin" not in user_roles and inspection.inspector_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return InspectionResponse(
        id=inspection.id,
        equipment_id=inspection.equipment_id,
        checklist_template_id=inspection.checklist_template_id,
        inspector_id=inspection.inspector_id,
        status=inspection.status,
        location_lat=inspection.location_lat,
        location_lng=inspection.location_lng,
        inspector_signature=inspection.inspector_signature,
        notes=inspection.notes,
        started_at=inspection.started_at,
        completed_at=inspection.completed_at,
        created_at=inspection.created_at,
        updated_at=inspection.updated_at,
        is_synced=inspection.is_synced,
        answers=[
            InspectionAnswerResponse(
                id=a.id,
                item_id=a.item_id,
                value=a.value,
                file_id=a.file_id,
                created_at=a.created_at,
            )
            for a in inspection.answers
        ]
    )

@router.post("", response_model=InspectionResponse, status_code=status.HTTP_201_CREATED)
async def create_inspection(
    inspection_data: InspectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новый осмотр"""
    await require_permission(current_user, "inspections:create", db)
    
    # Проверка существования оборудования и шаблона
    eq_result = await db.execute(select(Equipment).where(Equipment.id == inspection_data.equipment_id))
    if not eq_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    template_result = await db.execute(select(ChecklistTemplate).where(ChecklistTemplate.id == inspection_data.checklist_template_id))
    if not template_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Checklist template not found")
    
    new_inspection = Inspection(
        equipment_id=inspection_data.equipment_id,
        checklist_template_id=inspection_data.checklist_template_id,
        inspector_id=current_user.id,
        status="draft",
        location_lat=inspection_data.location_lat,
        location_lng=inspection_data.location_lng,
        notes=inspection_data.notes,
        started_at=datetime.utcnow(),
        is_synced=True
    )
    db.add(new_inspection)
    await db.flush()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="inspection",
        entity_id=new_inspection.id,
        description=f"Created inspection for equipment {inspection_data.equipment_id}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(new_inspection)
    
    result = await db.execute(
        select(Inspection)
        .options(selectinload(Inspection.answers))
        .where(Inspection.id == new_inspection.id)
    )
    inspection = result.scalar_one()
    
    return InspectionResponse(
        id=inspection.id,
        equipment_id=inspection.equipment_id,
        checklist_template_id=inspection.checklist_template_id,
        inspector_id=inspection.inspector_id,
        status=inspection.status,
        location_lat=inspection.location_lat,
        location_lng=inspection.location_lng,
        inspector_signature=inspection.inspector_signature,
        notes=inspection.notes,
        started_at=inspection.started_at,
        completed_at=inspection.completed_at,
        created_at=inspection.created_at,
        updated_at=inspection.updated_at,
        is_synced=inspection.is_synced,
        answers=[]
    )

@router.put("/{inspection_id}", response_model=InspectionResponse)
async def update_inspection(
    inspection_id: int,
    inspection_data: InspectionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить осмотр"""
    await require_permission(current_user, "inspections:update", db)
    
    result = await db.execute(
        select(Inspection)
        .options(selectinload(Inspection.answers))
        .where(Inspection.id == inspection_id)
    )
    inspection = result.scalar_one_or_none()
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    # Проверка прав доступа
    user_roles = [ur.role.name for ur in current_user.roles]
    if "admin" not in user_roles and inspection.inspector_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = inspection_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(inspection, field, value)
    
    # Обновление статуса
    if inspection_data.status == "in_progress" and not inspection.started_at:
        inspection.started_at = datetime.utcnow()
    elif inspection_data.status == "completed" and not inspection.completed_at:
        inspection.completed_at = datetime.utcnow()
    
    inspection.updated_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="inspection",
        entity_id=inspection.id,
        description=f"Updated inspection {inspection.id}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(inspection)
    
    return InspectionResponse(
        id=inspection.id,
        equipment_id=inspection.equipment_id,
        checklist_template_id=inspection.checklist_template_id,
        inspector_id=inspection.inspector_id,
        status=inspection.status,
        location_lat=inspection.location_lat,
        location_lng=inspection.location_lng,
        inspector_signature=inspection.inspector_signature,
        notes=inspection.notes,
        started_at=inspection.started_at,
        completed_at=inspection.completed_at,
        created_at=inspection.created_at,
        updated_at=inspection.updated_at,
        is_synced=inspection.is_synced,
        answers=[
            InspectionAnswerResponse(
                id=a.id,
                item_id=a.item_id,
                value=a.value,
                file_id=a.file_id,
                created_at=a.created_at,
            )
            for a in inspection.answers
        ]
    )

@router.post("/{inspection_id}/answers", response_model=InspectionAnswerResponse)
async def add_inspection_answer(
    inspection_id: int,
    answer_data: InspectionAnswerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Добавить ответ в осмотр"""
    await require_permission(current_user, "inspections:update", db)
    
    result = await db.execute(select(Inspection).where(Inspection.id == inspection_id))
    inspection = result.scalar_one_or_none()
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    # Проверка прав доступа
    user_roles = [ur.role.name for ur in current_user.roles]
    if "admin" not in user_roles and inspection.inspector_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Проверка существующего ответа
    existing = await db.execute(
        select(InspectionAnswer).where(
            and_(
                InspectionAnswer.inspection_id == inspection_id,
                InspectionAnswer.item_id == answer_data.item_id
            )
        )
    )
    existing_answer = existing.scalar_one_or_none()
    
    if existing_answer:
        # Обновление существующего ответа
        existing_answer.value = answer_data.value
        existing_answer.file_id = answer_data.file_id
        existing_answer.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing_answer)
        
        return InspectionAnswerResponse(
            id=existing_answer.id,
            item_id=existing_answer.item_id,
            value=existing_answer.value,
            file_id=existing_answer.file_id,
            created_at=existing_answer.created_at,
        )
    else:
        # Создание нового ответа
        new_answer = InspectionAnswer(
            inspection_id=inspection_id,
            item_id=answer_data.item_id,
            value=answer_data.value,
            file_id=answer_data.file_id
        )
        db.add(new_answer)
        await db.commit()
        await db.refresh(new_answer)
        
        return InspectionAnswerResponse(
            id=new_answer.id,
            item_id=new_answer.item_id,
            value=new_answer.value,
            file_id=new_answer.file_id,
            created_at=new_answer.created_at,
        )

@router.delete("/{inspection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inspection(
    inspection_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить осмотр"""
    await require_permission(current_user, "inspections:delete", db)
    
    result = await db.execute(select(Inspection).where(Inspection.id == inspection_id))
    inspection = result.scalar_one_or_none()
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    
    # Проверка прав доступа
    user_roles = [ur.role.name for ur in current_user.roles]
    if "admin" not in user_roles and inspection.inspector_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="inspection",
        entity_id=inspection.id,
        description=f"Deleted inspection {inspection.id}"
    )
    db.add(activity)
    
    await db.delete(inspection)
    await db.commit()
    return None

