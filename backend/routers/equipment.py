from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ValidationError
import logging
import csv
import io
import re

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
    inventory_number: Optional[str] = None
    position: Optional[str] = None
    workshop: Optional[str] = None
    status: Optional[str] = "active"

class EquipmentUpdate(BaseModel):
    equipment_type: Optional[str] = None
    passport_number: Optional[str] = None
    load_capacity: Optional[float] = None
    manufacturer: Optional[str] = None
    installation_date: Optional[datetime] = None
    pto_date: Optional[datetime] = None
    cto_date: Optional[datetime] = None
    installation_location: Optional[str] = None
    inventory_number: Optional[str] = None
    position: Optional[str] = None
    workshop: Optional[str] = None
    status: Optional[str] = None

class EquipmentResponse(BaseModel):
    id: int
    equipment_type: str
    passport_number: str
    inventory_number: Optional[str]
    position: Optional[str]
    workshop: Optional[str]
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

class EquipmentBulkItem(BaseModel):
    equipment_type: str
    passport_number: str
    load_capacity: Optional[float] = None
    manufacturer: Optional[str] = None
    installation_date: Optional[datetime] = None
    pto_date: Optional[datetime] = None
    cto_date: Optional[datetime] = None
    installation_location: Optional[str] = None
    inventory_number: Optional[str] = None
    position: Optional[str] = None
    workshop: Optional[str] = None
    status: Optional[str] = "active"

class EquipmentBulkRequest(BaseModel):
    items: List[EquipmentBulkItem]
    skip_duplicates: bool = True

class EquipmentBulkResponse(BaseModel):
    created: int
    skipped: int
    created_ids: List[int]
    errors: List[dict]

    class Config:
        arbitrary_types_allowed = True

    class Config:
        from_attributes = True

def _equipment_to_response(equipment: Equipment) -> EquipmentResponse:
    return EquipmentResponse(
        id=equipment.id,
        equipment_type=equipment.equipment_type,
        passport_number=equipment.passport_number,
        inventory_number=equipment.inventory_number,
        position=equipment.position,
        workshop=equipment.workshop,
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


async def _bulk_create_equipment_items(
    items: List[EquipmentBulkItem],
    skip_duplicates: bool,
    current_user: User,
    db: AsyncSession
) -> EquipmentBulkResponse:
    created_ids: List[int] = []
    skipped = 0
    errors: List[dict] = []

    for index, item in enumerate(items):
        try:
            # Проверяем обязательные поля
            if not item.passport_number or not item.equipment_type:
                raise HTTPException(status_code=400, detail="Passport number and equipment type are required")

            # Проверяем дубликаты паспорта
            existing_passport = await db.execute(
                select(Equipment.id).where(Equipment.passport_number == item.passport_number)
            )
            if existing_passport.scalar_one_or_none():
                if skip_duplicates:
                    errors.append(
                        {
                            "index": index,
                            "passport_number": item.passport_number,
                            "detail": "Passport number already exists",
                            "type": "duplicate",
                        }
                    )
                    skipped += 1
                    continue
                raise HTTPException(status_code=400, detail="Passport number already exists")

            # Проверяем дубликаты инвентарного номера
            if item.inventory_number:
                existing_inventory = await db.execute(
                    select(Equipment.id).where(Equipment.inventory_number == item.inventory_number)
                )
                if existing_inventory.scalar_one_or_none():
                    if skip_duplicates:
                        errors.append(
                            {
                                "index": index,
                                "passport_number": item.passport_number,
                                "detail": "Inventory number already exists",
                                "type": "duplicate",
                            }
                        )
                        skipped += 1
                        continue
                    raise HTTPException(status_code=400, detail="Inventory number already exists")

            new_equipment = Equipment(
                **item.dict(),
                created_by=current_user.id,
                status=item.status or "active"
            )
            db.add(new_equipment)
            await db.flush()
            created_ids.append(new_equipment.id)

            activity = UserActivity(
                user_id=current_user.id,
                action_type="create",
                entity_type="equipment",
                entity_id=new_equipment.id,
                description=f"Bulk created equipment {new_equipment.passport_number}"
            )
            db.add(activity)
        except HTTPException as http_exc:
            errors.append(
                {
                    "index": index,
                    "passport_number": item.passport_number,
                    "detail": http_exc.detail,
                }
            )
            if not skip_duplicates:
                await db.rollback()
                raise
        except Exception as exc:
            errors.append(
                {
                    "index": index,
                    "passport_number": item.passport_number,
                    "detail": str(exc),
                }
            )

    await db.commit()

    return EquipmentBulkResponse(
        created=len(created_ids),
        skipped=skipped,
        created_ids=created_ids,
        errors=errors,
    )


def _normalize_csv_date(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = value.strip()
    if not value:
        return None
    # Поддерживаем форматы YYYY-MM-DD и DD.MM.YYYY
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return f"{value}T00:00:00"
    if re.match(r"^\d{2}\.\d{2}\.\d{4}$", value):
        dt = datetime.strptime(value, "%d.%m.%Y")
        return dt.strftime("%Y-%m-%dT00:00:00")
    # Оставляем как есть - Pydantic попробует распарсить
    return value


def _normalize_float(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    value = value.strip().replace(",", ".")
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


@router.get("", response_model=List[EquipmentResponse])
async def get_equipment_list(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    equipment_type: Optional[str] = None,
    status: Optional[str] = None,
    workshop: Optional[str] = None,
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
                Equipment.inventory_number.ilike(f"%{search}%"),
                Equipment.position.ilike(f"%{search}%"),
                Equipment.equipment_type.ilike(f"%{search}%"),
                Equipment.workshop.ilike(f"%{search}%"),
                Equipment.installation_location.ilike(f"%{search}%")
            )
        )
    
    if equipment_type:
        query = query.where(Equipment.equipment_type == equipment_type)
    
    if status:
        query = query.where(Equipment.status == status)
    
    if workshop:
        query = query.where(Equipment.workshop == workshop)
    
    query = query.order_by(Equipment.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    equipment_list = result.scalars().all()
    
    return [_equipment_to_response(eq) for eq in equipment_list]

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
    
    return _equipment_to_response(equipment)

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
        
        if equipment_data.inventory_number:
            result = await db.execute(
                select(Equipment).where(Equipment.inventory_number == equipment_data.inventory_number)
            )
            if result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Inventory number already exists")
        
        logger.debug("Creating equipment object")
        new_equipment = Equipment(
            **equipment_data.dict(),
            created_by=current_user.id,
            status=equipment_data.status or "active"
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
        
        return _equipment_to_response(new_equipment)
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
    
    return _equipment_to_response(equipment)


@router.post("/bulk", response_model=EquipmentBulkResponse)
async def bulk_create_equipment(
    payload: EquipmentBulkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Массовое добавление оборудования"""
    await require_permission(current_user, "equipment:create", db)

    return await _bulk_create_equipment_items(
        items=payload.items,
        skip_duplicates=payload.skip_duplicates,
        current_user=current_user,
        db=db
    )


@router.post("/bulk/upload", response_model=EquipmentBulkResponse)
async def bulk_upload_equipment(
    file: UploadFile = File(...),
    skip_duplicates: bool = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Массовое добавление оборудования через CSV"""
    await require_permission(current_user, "equipment:create", db)

    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")

    raw_content = await file.read()
    if not raw_content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        decoded = raw_content.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = raw_content.decode("utf-8")

    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is missing headers")

    parsed_items: List[EquipmentBulkItem] = []
    parse_errors: List[dict] = []
    required_fields = {"equipment_type", "passport_number"}
    headers = {h.strip().lower() for h in reader.fieldnames if h}
    if not required_fields.issubset(headers):
        raise HTTPException(
            status_code=400,
            detail="CSV file must contain at least 'equipment_type' and 'passport_number' columns",
        )

    # Список ключевых слов, которые указывают на строку с подсказками
    hint_keywords = ["обязательно", "необязательно", "например", "тип пс", "номер паспорта", "инвентарный номер", "позиция", "цех", "грузоподъемность", "завод", "место установки", "дата ввода", "дата пто", "дата что", "статус"]
    
    for row_index, row in enumerate(reader, start=2):  # Учитываем строку заголовка
        if not row:
            continue
        # Проверяем, есть ли данные в строке
        if not any((value or "").strip() for value in row.values()):
            continue
        
        # Проверяем, является ли строка подсказками (содержит ключевые слова)
        row_text = " ".join((value or "").lower() for value in row.values())
        if any(keyword in row_text for keyword in hint_keywords):
            continue  # Пропускаем строку с подсказками

        normalized = {
            "equipment_type": (row.get("equipment_type") or "").strip(),
            "passport_number": (row.get("passport_number") or "").strip(),
            "inventory_number": (row.get("inventory_number") or "").strip() or None,
            "position": (row.get("position") or "").strip() or None,
            "workshop": (row.get("workshop") or "").strip() or None,
            "load_capacity": _normalize_float(row.get("load_capacity")),
            "manufacturer": (row.get("manufacturer") or "").strip() or None,
            "installation_location": (row.get("installation_location") or "").strip() or None,
            "installation_date": _normalize_csv_date(row.get("installation_date")),
            "pto_date": _normalize_csv_date(row.get("pto_date")),
            "cto_date": _normalize_csv_date(row.get("cto_date")),
            "status": (row.get("status") or "active").strip() or "active",
        }

        try:
            parsed_items.append(EquipmentBulkItem(**normalized))
        except ValidationError as exc:
            parse_errors.append(
                {
                    "row": row_index,
                    "detail": exc.errors(),
                }
            )

    if not parsed_items:
        raise HTTPException(status_code=400, detail="CSV file does not contain valid rows")

    response = await _bulk_create_equipment_items(
        items=parsed_items,
        skip_duplicates=skip_duplicates,
        current_user=current_user,
        db=db,
    )

    response.errors.extend(parse_errors)
    response.skipped += len(parse_errors)
    return response

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

