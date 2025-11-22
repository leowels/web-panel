from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import ChecklistTemplate, ChecklistItem, UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import ChecklistTemplate, ChecklistItem, UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/checklists", tags=["checklists"])

class ChecklistItemCreate(BaseModel):
    item_type: str  # text, bool, photo, number, select
    label: str
    description: Optional[str] = None
    is_required: bool = False
    order: int = 0
    options: Optional[dict] = None
    validation_rules: Optional[dict] = None

class ChecklistTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    equipment_type: Optional[str] = None
    items: List[ChecklistItemCreate] = []

class ChecklistTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    equipment_type: Optional[str] = None
    is_active: Optional[bool] = None

class ChecklistItemResponse(BaseModel):
    id: int
    item_type: str
    label: str
    description: Optional[str]
    is_required: bool
    order: int
    options: Optional[dict]
    validation_rules: Optional[dict]

    class Config:
        from_attributes = True

class ChecklistTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    equipment_type: Optional[str]
    version: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    items: List[ChecklistItemResponse] = []

    class Config:
        from_attributes = True

@router.get("", response_model=List[ChecklistTemplateResponse])
async def get_checklists(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    equipment_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список шаблонов чек-листов"""
    await require_permission(current_user, "checklists:read", db)
    
    query = select(ChecklistTemplate).options(selectinload(ChecklistTemplate.items))
    
    if equipment_type:
        query = query.where(ChecklistTemplate.equipment_type == equipment_type)
    
    if is_active is not None:
        query = query.where(ChecklistTemplate.is_active == is_active)
    
    query = query.order_by(ChecklistTemplate.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    templates = result.scalars().all()
    
    return [
        ChecklistTemplateResponse(
            id=t.id,
            name=t.name,
            description=t.description,
            equipment_type=t.equipment_type,
            version=t.version,
            is_active=t.is_active,
            created_at=t.created_at,
            updated_at=t.updated_at,
            items=[
                ChecklistItemResponse(
                    id=item.id,
                    item_type=item.item_type,
                    label=item.label,
                    description=item.description,
                    is_required=item.is_required,
                    order=item.order,
                    options=item.options,
                    validation_rules=item.validation_rules,
                )
                for item in sorted(t.items, key=lambda x: x.order)
            ]
        )
        for t in templates
    ]

@router.get("/{template_id}", response_model=ChecklistTemplateResponse)
async def get_checklist(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить шаблон чек-листа по ID"""
    await require_permission(current_user, "checklists:read", db)
    
    result = await db.execute(
        select(ChecklistTemplate)
        .options(selectinload(ChecklistTemplate.items))
        .where(ChecklistTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Checklist template not found")
    
    return ChecklistTemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        equipment_type=template.equipment_type,
        version=template.version,
        is_active=template.is_active,
        created_at=template.created_at,
        updated_at=template.updated_at,
        items=[
            ChecklistItemResponse(
                id=item.id,
                item_type=item.item_type,
                label=item.label,
                description=item.description,
                is_required=item.is_required,
                order=item.order,
                options=item.options,
                validation_rules=item.validation_rules,
            )
            for item in sorted(template.items, key=lambda x: x.order)
        ]
    )

@router.post("", response_model=ChecklistTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_checklist(
    checklist_data: ChecklistTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новый шаблон чек-листа"""
    await require_permission(current_user, "checklists:create", db)
    
    new_template = ChecklistTemplate(
        name=checklist_data.name,
        description=checklist_data.description,
        equipment_type=checklist_data.equipment_type,
        version=1,
        is_active=True,
        created_by=current_user.id
    )
    db.add(new_template)
    await db.flush()
    
    # Добавление элементов
    for idx, item_data in enumerate(checklist_data.items):
        item = ChecklistItem(
            template_id=new_template.id,
            item_type=item_data.item_type,
            label=item_data.label,
            description=item_data.description,
            is_required=item_data.is_required,
            order=item_data.order if item_data.order > 0 else idx,
            options=item_data.options,
            validation_rules=item_data.validation_rules,
        )
        db.add(item)
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="checklist",
        entity_id=new_template.id,
        description=f"Created checklist template {new_template.name}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(new_template)
    
    result = await db.execute(
        select(ChecklistTemplate)
        .options(selectinload(ChecklistTemplate.items))
        .where(ChecklistTemplate.id == new_template.id)
    )
    template = result.scalar_one()
    
    return ChecklistTemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        equipment_type=template.equipment_type,
        version=template.version,
        is_active=template.is_active,
        created_at=template.created_at,
        updated_at=template.updated_at,
        items=[
            ChecklistItemResponse(
                id=item.id,
                item_type=item.item_type,
                label=item.label,
                description=item.description,
                is_required=item.is_required,
                order=item.order,
                options=item.options,
                validation_rules=item.validation_rules,
            )
            for item in sorted(template.items, key=lambda x: x.order)
        ]
    )

@router.put("/{template_id}", response_model=ChecklistTemplateResponse)
async def update_checklist(
    template_id: int,
    checklist_data: ChecklistTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить шаблон чек-листа"""
    await require_permission(current_user, "checklists:update", db)
    
    result = await db.execute(select(ChecklistTemplate).where(ChecklistTemplate.id == template_id))
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Checklist template not found")
    
    update_data = checklist_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)
    
    template.updated_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="checklist",
        entity_id=template.id,
        description=f"Updated checklist template {template.name}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(template)
    
    result = await db.execute(
        select(ChecklistTemplate)
        .options(selectinload(ChecklistTemplate.items))
        .where(ChecklistTemplate.id == template.id)
    )
    updated_template = result.scalar_one()
    
    return ChecklistTemplateResponse(
        id=updated_template.id,
        name=updated_template.name,
        description=updated_template.description,
        equipment_type=updated_template.equipment_type,
        version=updated_template.version,
        is_active=updated_template.is_active,
        created_at=updated_template.created_at,
        updated_at=updated_template.updated_at,
        items=[
            ChecklistItemResponse(
                id=item.id,
                item_type=item.item_type,
                label=item.label,
                description=item.description,
                is_required=item.is_required,
                order=item.order,
                options=item.options,
                validation_rules=item.validation_rules,
            )
            for item in sorted(updated_template.items, key=lambda x: x.order)
        ]
    )

@router.post("/{template_id}/items", response_model=ChecklistItemResponse)
async def add_checklist_item(
    template_id: int,
    item_data: ChecklistItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Добавить элемент в чек-лист"""
    await require_permission(current_user, "checklists:update", db)
    
    result = await db.execute(select(ChecklistTemplate).where(ChecklistTemplate.id == template_id))
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Checklist template not found")
    
    new_item = ChecklistItem(
        template_id=template_id,
        **item_data.dict()
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    
    return ChecklistItemResponse(
        id=new_item.id,
        item_type=new_item.item_type,
        label=new_item.label,
        description=new_item.description,
        is_required=new_item.is_required,
        order=new_item.order,
        options=new_item.options,
        validation_rules=new_item.validation_rules,
    )

@router.put("/items/{item_id}", response_model=ChecklistItemResponse)
async def update_checklist_item(
    item_id: int,
    item_data: ChecklistItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить элемент чек-листа"""
    await require_permission(current_user, "checklists:update", db)
    
    result = await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    
    update_data = item_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    
    await db.commit()
    await db.refresh(item)
    
    return ChecklistItemResponse(
        id=item.id,
        item_type=item.item_type,
        label=item.label,
        description=item.description,
        is_required=item.is_required,
        order=item.order,
        options=item.options,
        validation_rules=item.validation_rules,
    )

@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить элемент чек-листа"""
    await require_permission(current_user, "checklists:update", db)
    
    result = await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    
    await db.delete(item)
    await db.commit()
    return None

@router.post("/{template_id}/reorder", response_model=ChecklistTemplateResponse)
async def reorder_checklist_items(
    template_id: int,
    item_orders: dict,  # {item_id: order}
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Переупорядочить элементы чек-листа"""
    await require_permission(current_user, "checklists:update", db)
    
    result = await db.execute(select(ChecklistTemplate).where(ChecklistTemplate.id == template_id))
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Checklist template not found")
    
    # Обновление порядка элементов
    for item_id, order in reorder_data.item_orders.items():
        item_result = await db.execute(select(ChecklistItem).where(ChecklistItem.id == item_id))
        item = item_result.scalar_one_or_none()
        if item and item.template_id == template_id:
            item.order = order
    
    await db.commit()
    
    result = await db.execute(
        select(ChecklistTemplate)
        .options(selectinload(ChecklistTemplate.items))
        .where(ChecklistTemplate.id == template_id)
    )
    updated_template = result.scalar_one()
    
    return ChecklistTemplateResponse(
        id=updated_template.id,
        name=updated_template.name,
        description=updated_template.description,
        equipment_type=updated_template.equipment_type,
        version=updated_template.version,
        is_active=updated_template.is_active,
        created_at=updated_template.created_at,
        updated_at=updated_template.updated_at,
        items=[
            ChecklistItemResponse(
                id=item.id,
                item_type=item.item_type,
                label=item.label,
                description=item.description,
                is_required=item.is_required,
                order=item.order,
                options=item.options,
                validation_rules=item.validation_rules,
            )
            for item in sorted(updated_template.items, key=lambda x: x.order)
        ]
    )

@router.post("/{template_id}/version", response_model=ChecklistTemplateResponse)
async def create_checklist_version(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новую версию шаблона"""
    await require_permission(current_user, "checklists:create", db)
    
    result = await db.execute(
        select(ChecklistTemplate)
        .options(selectinload(ChecklistTemplate.items))
        .where(ChecklistTemplate.id == template_id)
    )
    old_template = result.scalar_one_or_none()
    
    if not old_template:
        raise HTTPException(status_code=404, detail="Checklist template not found")
    
    # Создание новой версии
    new_template = ChecklistTemplate(
        name=old_template.name,
        description=old_template.description,
        equipment_type=old_template.equipment_type,
        version=old_template.version + 1,
        is_active=True,
        created_by=current_user.id
    )
    db.add(new_template)
    await db.flush()
    
    # Копирование элементов
    for old_item in old_template.items:
        new_item = ChecklistItem(
            template_id=new_template.id,
            item_type=old_item.item_type,
            label=old_item.label,
            description=old_item.description,
            is_required=old_item.is_required,
            order=old_item.order,
            options=old_item.options,
            validation_rules=old_item.validation_rules,
        )
        db.add(new_item)
    
    # Деактивация старой версии
    old_template.is_active = False
    
    await db.commit()
    await db.refresh(new_template)
    
    result = await db.execute(
        select(ChecklistTemplate)
        .options(selectinload(ChecklistTemplate.items))
        .where(ChecklistTemplate.id == new_template.id)
    )
    template = result.scalar_one()
    
    return ChecklistTemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        equipment_type=template.equipment_type,
        version=template.version,
        is_active=template.is_active,
        created_at=template.created_at,
        updated_at=template.updated_at,
        items=[
            ChecklistItemResponse(
                id=item.id,
                item_type=item.item_type,
                label=item.label,
                description=item.description,
                is_required=item.is_required,
                order=item.order,
                options=item.options,
                validation_rules=item.validation_rules,
            )
            for item in sorted(template.items, key=lambda x: x.order)
        ]
    )

