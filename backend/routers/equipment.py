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
import os
from pathlib import Path

from PIL import Image
import pytesseract

logger = logging.getLogger(__name__)

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import Equipment, EquipmentHistory, UserActivity, User, UserRole, File
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import Equipment, EquipmentHistory, UserActivity, User, UserRole, File
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
    map_x: Optional[float] = None  # Координата X на карте (0-100%)
    map_y: Optional[float] = None  # Координата Y на карте (0-100%)
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
    map_x: Optional[float] = None  # Координата X на карте (0-100%)
    map_y: Optional[float] = None  # Координата Y на карте (0-100%)
    status: Optional[str] = None

class EquipmentResponse(BaseModel):
    id: int
    equipment_type: str
    passport_number: str
    inventory_number: Optional[str]
    position: Optional[str]
    workshop: Optional[str]
    map_x: Optional[float]  # Координата X на карте (0-100%)
    map_y: Optional[float]  # Координата Y на карте (0-100%)
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
        from_attributes = True

class EquipmentBulkUpdateRequest(BaseModel):
    equipment_ids: List[int]
    update_data: EquipmentUpdate

class EquipmentBulkUpdateResponse(BaseModel):
    updated: int
    errors: List[dict]

class EquipmentBulkDatesRequest(BaseModel):
    equipment_ids: List[int]
    pto_date: Optional[datetime] = None
    cto_date: Optional[datetime] = None

class EquipmentBulkDatesResponse(BaseModel):
    updated: int
    errors: List[dict]

class EquipmentOCRUpsertRequest(BaseModel):
    name: Optional[str] = None
    capacity: Optional[float] = None
    inventory_number: Optional[str] = None
    manufacturer: Optional[str] = None
    installation_date: Optional[datetime] = None
    pto_date: Optional[datetime] = None
    cto_date: Optional[datetime] = None
    equipment_type: Optional[str] = None
    passport_number: Optional[str] = None
    position: Optional[str] = None
    workshop: Optional[str] = None

class EquipmentOCRUpsertResponse(BaseModel):
    id: int
    created: bool  # True если создан новый, False если обновлен существующий


class EquipmentOCRImportRequest(BaseModel):
    """
    Запрос на импорт оборудования через OCR/табличный текст.
    Варианты:
    - ocr_text: уже распознанный текст таблицы (CSV-подобный)
    - file_id: ID файла в таблице files (фото или CSV/текст)
    """
    ocr_text: Optional[str] = None
    file_id: Optional[int] = None


def _equipment_to_response(equipment: Equipment) -> EquipmentResponse:
    return EquipmentResponse(
        id=equipment.id,
        equipment_type=equipment.equipment_type,
        passport_number=equipment.passport_number,
        inventory_number=equipment.inventory_number,
        position=equipment.position,
        workshop=equipment.workshop,
        map_x=equipment.map_x,
        map_y=equipment.map_y,
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


def _ocr_image_to_text(image_path: str) -> str:
    """
    Преобразование изображения (фото таблицы) в текст с помощью Tesseract OCR.
    Используется как бесплатный локальный OCR.
    """
    try:
        # Открываем изображение
        img = Image.open(image_path)
        logger.info(f"Opened image: {img.format}, size: {img.size}, mode: {img.mode}")
        
        # Конвертируем в RGB, если нужно (для форматов с прозрачностью или других режимов)
        if img.mode != 'RGB':
            logger.info(f"Converting image from {img.mode} to RGB")
            # Создаем белый фон для изображений с прозрачностью
            rgb_img = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'RGBA':
                rgb_img.paste(img, mask=img.split()[3])  # Используем альфа-канал как маску
            else:
                rgb_img.paste(img)
            img = rgb_img
        
        # Убеждаемся, что изображение в правильном формате для pytesseract
        if img.mode != 'RGB':
            img = img.convert('RGB')
            
    except Exception as e:
        logger.error(f"Failed to open/process image for OCR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to open image for OCR: {str(e)}")

    try:
        # Русский + английский, таблицы на ПС обычно на русском
        # Используем дополнительную обработку для лучшего распознавания таблиц
        text = pytesseract.image_to_string(img, lang="rus+eng", config='--psm 6')
        logger.info(f"OCR completed, extracted {len(text)} characters")
        return text
    except Exception as e:
        logger.error(f"OCR error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR error: {str(e)}")


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


def _parse_equipment_csv_text(decoded: str) -> (List[EquipmentBulkItem], List[dict]):
    """
    Общий CSV-парсер для массового импорта оборудования.
    Используется как для загрузки файлов, так и для OCR-импорта.
    """
    # Определяем разделитель (поддержка как запятой, так и точки с запятой)
    first_line = decoded.splitlines()[0] if decoded.splitlines() else ""
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","
    reader = csv.DictReader(io.StringIO(decoded), delimiter=delimiter)
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
    hint_keywords = [
        "обязательно",
        "необязательно",
        "например",
        "тип пс",
        "номер паспорта",
        "инвентарный номер",
        "позиция",
        "цех",
        "грузоподъемность",
        "завод",
        "место установки",
        "дата ввода",
        "дата пто",
        "дата что",
        "статус",
    ]

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

    return parsed_items, parse_errors


@router.post("/bulk/upload", response_model=EquipmentBulkResponse)
async def bulk_upload_equipment(
    file: UploadFile = File(),
    skip_duplicates: bool = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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

    parsed_items, parse_errors = _parse_equipment_csv_text(decoded)

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

@router.put("/bulk/update", response_model=EquipmentBulkUpdateResponse)
async def bulk_update_equipment(
    payload: EquipmentBulkUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Массовое редактирование оборудования"""
    await require_permission(current_user, "equipment:update", db)

    if not payload.equipment_ids:
        raise HTTPException(status_code=400, detail="Equipment IDs are required")

    updated = 0
    errors: List[dict] = []
    update_data = payload.update_data.dict(exclude_unset=True)

    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")

    for eq_id in payload.equipment_ids:
        try:
            result = await db.execute(select(Equipment).where(Equipment.id == eq_id))
            equipment = result.scalar_one_or_none()
            
            if not equipment:
                errors.append({"equipment_id": eq_id, "detail": "Equipment not found"})
                continue

            # Сохранение истории изменений
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
                description=f"Bulk updated equipment {equipment.passport_number}"
            )
            db.add(activity)
            updated += 1

        except Exception as exc:
            errors.append({"equipment_id": eq_id, "detail": str(exc)})

    await db.commit()

    return EquipmentBulkUpdateResponse(updated=updated, errors=errors)

@router.put("/bulk/dates", response_model=EquipmentBulkDatesResponse)
async def bulk_update_dates(
    payload: EquipmentBulkDatesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Массовое назначение дат ПТО/ЧТО"""
    await require_permission(current_user, "equipment:update", db)

    if not payload.equipment_ids:
        raise HTTPException(status_code=400, detail="Equipment IDs are required")

    if not payload.pto_date and not payload.cto_date:
        raise HTTPException(status_code=400, detail="At least one date (PTO or CTO) must be provided")

    updated = 0
    errors: List[dict] = []

    for eq_id in payload.equipment_ids:
        try:
            result = await db.execute(select(Equipment).where(Equipment.id == eq_id))
            equipment = result.scalar_one_or_none()
            
            if not equipment:
                errors.append({"equipment_id": eq_id, "detail": "Equipment not found"})
                continue

            # Сохранение истории изменений
            if payload.pto_date is not None:
                old_pto = equipment.pto_date
                if old_pto != payload.pto_date:
                    history = EquipmentHistory(
                        equipment_id=equipment.id,
                        changed_by=current_user.id,
                        field_name="pto_date",
                        old_value=str(old_pto) if old_pto else None,
                        new_value=str(payload.pto_date) if payload.pto_date else None
                    )
                    db.add(history)
                    equipment.pto_date = payload.pto_date

            if payload.cto_date is not None:
                old_cto = equipment.cto_date
                if old_cto != payload.cto_date:
                    history = EquipmentHistory(
                        equipment_id=equipment.id,
                        changed_by=current_user.id,
                        field_name="cto_date",
                        old_value=str(old_cto) if old_cto else None,
                        new_value=str(payload.cto_date) if payload.cto_date else None
                    )
                    db.add(history)
                    equipment.cto_date = payload.cto_date

            # Логирование
            activity = UserActivity(
                user_id=current_user.id,
                action_type="update",
                entity_type="equipment",
                entity_id=equipment.id,
                description=f"Bulk updated dates for equipment {equipment.passport_number}"
            )
            db.add(activity)
            updated += 1

        except Exception as exc:
            errors.append({"equipment_id": eq_id, "detail": str(exc)})

    await db.commit()

    return EquipmentBulkDatesResponse(updated=updated, errors=errors)

@router.post("/ocr-upsert", response_model=EquipmentOCRUpsertResponse)
async def ocr_upsert_equipment(
    equipment_data: EquipmentOCRUpsertRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать или обновить оборудование через OCR данные"""
    await require_permission(current_user, "equipment:create", db)
    
    # Проверяем обязательные поля
    if not equipment_data.passport_number and not equipment_data.inventory_number:
        raise HTTPException(
            status_code=400, 
            detail="Either passport_number or inventory_number is required"
        )
    
    # Ищем существующее оборудование
    existing_equipment = None
    
    # Сначала ищем по паспортному номеру
    if equipment_data.passport_number:
        result = await db.execute(
            select(Equipment).where(Equipment.passport_number == equipment_data.passport_number)
        )
        existing_equipment = result.scalar_one_or_none()
    
    # Если не найдено по паспорту, ищем по инвентарному номеру
    if not existing_equipment and equipment_data.inventory_number:
        result = await db.execute(
            select(Equipment).where(Equipment.inventory_number == equipment_data.inventory_number)
        )
        existing_equipment = result.scalar_one_or_none()
    
    # Если не найдено по инвентарному, ищем по имени (если указано)
    if not existing_equipment and equipment_data.name:
        # Ищем по комбинации типа и позиции
        search_conditions = []
        if equipment_data.equipment_type:
            search_conditions.append(Equipment.equipment_type.ilike(f"%{equipment_data.equipment_type}%"))
        if equipment_data.position:
            search_conditions.append(Equipment.position.ilike(f"%{equipment_data.position}%"))
        
        if search_conditions:
            result = await db.execute(
                select(Equipment).where(and_(*search_conditions))
            )
            potential_matches = result.scalars().all()
            
            # Если найдено только одно совпадение, используем его
            if len(potential_matches) == 1:
                existing_equipment = potential_matches[0]
    
    created = False
    
    if existing_equipment:
        # Обновляем существующее оборудование
        logger.info(f"Updating existing equipment ID {existing_equipment.id}")
        
        # Обновляем только непустые поля
        update_fields = {}
        
        if equipment_data.name and not existing_equipment.equipment_type:
            update_fields['equipment_type'] = equipment_data.name
        elif equipment_data.equipment_type:
            update_fields['equipment_type'] = equipment_data.equipment_type
            
        if equipment_data.capacity and not existing_equipment.load_capacity:
            update_fields['load_capacity'] = equipment_data.capacity
            
        if equipment_data.inventory_number and not existing_equipment.inventory_number:
            update_fields['inventory_number'] = equipment_data.inventory_number
            
        if equipment_data.manufacturer and not existing_equipment.manufacturer:
            update_fields['manufacturer'] = equipment_data.manufacturer
            
        if equipment_data.installation_date and not existing_equipment.installation_date:
            update_fields['installation_date'] = equipment_data.installation_date
            
        if equipment_data.pto_date and not existing_equipment.pto_date:
            update_fields['pto_date'] = equipment_data.pto_date
            
        if equipment_data.cto_date and not existing_equipment.cto_date:
            update_fields['cto_date'] = equipment_data.cto_date
            
        if equipment_data.position and not existing_equipment.position:
            update_fields['position'] = equipment_data.position
            
        if equipment_data.workshop and not existing_equipment.workshop:
            update_fields['workshop'] = equipment_data.workshop
        
        # Применяем обновления
        for field, value in update_fields.items():
            setattr(existing_equipment, field, value)
        
        # Сохраняем историю изменений для обновленных полей
        for field, new_value in update_fields.items():
            history = EquipmentHistory(
                equipment_id=existing_equipment.id,
                changed_by=current_user.id,
                field_name=field,
                old_value=None,  # Было пустое
                new_value=str(new_value) if new_value else None
            )
            db.add(history)
        
        equipment_id = existing_equipment.id
        
    else:
        # Создаем новое оборудование
        logger.info("Creating new equipment from OCR data")
        
        # Определяем обязательные поля
        equipment_type = equipment_data.equipment_type or equipment_data.name or "Неопределенный тип"
        passport_number = equipment_data.passport_number
        
        # Если нет паспортного номера, генерируем временный
        if not passport_number:
            import random
            passport_number = f"OCR-{datetime.utcnow().strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
        
        # Проверяем уникальность паспортного номера
        result = await db.execute(
            select(Equipment).where(Equipment.passport_number == passport_number)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Passport number already exists")
        
        # Проверяем уникальность инвентарного номера если указан
        if equipment_data.inventory_number:
            result = await db.execute(
                select(Equipment).where(Equipment.inventory_number == equipment_data.inventory_number)
            )
            if result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Inventory number already exists")
        
        new_equipment = Equipment(
            equipment_type=equipment_type,
            passport_number=passport_number,
            inventory_number=equipment_data.inventory_number,
            load_capacity=equipment_data.capacity,
            manufacturer=equipment_data.manufacturer,
            installation_date=equipment_data.installation_date,
            pto_date=equipment_data.pto_date,
            cto_date=equipment_data.cto_date,
            position=equipment_data.position,
            workshop=equipment_data.workshop,
            status="active",
            created_by=current_user.id
        )
        db.add(new_equipment)
        await db.flush()
        
        equipment_id = new_equipment.id
        created = True
    
    # Логирование
    action = "create" if created else "update"
    activity = UserActivity(
        user_id=current_user.id,
        action_type=action,
        entity_type="equipment",
        entity_id=equipment_id,
        description=f"OCR {action}d equipment: {equipment_data.passport_number or equipment_data.inventory_number}"
    )
    db.add(activity)
    
    await db.commit()
    
    logger.info(f"OCR upsert completed: equipment_id={equipment_id}, created={created}")
    
    return EquipmentOCRUpsertResponse(
        id=equipment_id,
        created=created
    )


@router.post("/ocr-import", response_model=EquipmentBulkResponse)
async def ocr_import_equipment(
    payload: EquipmentOCRImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Массовый импорт оборудования на основе OCR-результата.

    Варианты использования:
    - Бот или внешний сервис распознал таблицу и прислал CSV-текст в ocr_text
    - Указан file_id на ранее загруженный CSV-файл в таблице files

    Поддержка распознавания фото (image → text) должна быть реализована
    во внешнем сервисе, который передаст уже готовый табличный текст.
    """
    await require_permission(current_user, "equipment:create", db)

    if not payload.ocr_text and not payload.file_id:
        raise HTTPException(
            status_code=400,
            detail="Either ocr_text or file_id must be provided",
        )

    decoded = None

    # Если пришёл готовый текст (например, от Telegram-бота после OCR)
    if payload.ocr_text:
        decoded = payload.ocr_text

    # Если указан file_id — пробуем прочитать содержимое файла
    if not decoded and payload.file_id:
        result = await db.execute(select(File).where(File.id == payload.file_id))
        file_obj: Optional[File] = result.scalar_one_or_none()
        if not file_obj:
            raise HTTPException(status_code=404, detail="File not found")

        if not file_obj.file_path:
            raise HTTPException(
                status_code=400,
                detail="File has no file_path, cannot read from disk",
            )

        # Определяем, является ли файл текстом/CSV или картинкой
        file_path = Path(file_obj.file_path)
        suffix = file_path.suffix.lower()

        # Если это изображение — запускаем OCR
        if suffix in {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"} or (
            file_obj.mime_type and file_obj.mime_type.startswith("image/")
        ):
            # Проверяем существование файла и нормализуем путь
            # Файлы сохраняются как относительные пути типа "uploads/filename"
            file_path_str = file_obj.file_path
            
            # Пробуем разные варианты пути
            possible_paths = [
                file_path_str,  # Как есть (если абсолютный)
                os.path.join("/app/backend", file_path_str),  # Относительно backend
                os.path.join("/app", file_path_str),  # Относительно корня
            ]
            
            actual_path = None
            for path in possible_paths:
                if os.path.exists(path):
                    actual_path = path
                    break
            
            if not actual_path:
                # Если ни один путь не найден, пробуем найти файл по имени в uploads
                filename = os.path.basename(file_path_str)
                uploads_path = os.path.join("/app/backend", "uploads", filename)
                if os.path.exists(uploads_path):
                    actual_path = uploads_path
                else:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Image file not found on disk. Tried: {possible_paths + [uploads_path]}",
                    )
            
            logger.info(f"Running OCR for equipment import on image file: {actual_path}")
            decoded = _ocr_image_to_text(actual_path)
        else:
            # Иначе считаем, что это текст/CSV
            try:
                with open(file_obj.file_path, "rb") as f:
                    raw_content = f.read()
            except FileNotFoundError:
                raise HTTPException(
                    status_code=404,
                    detail=f"File not found on disk: {file_obj.file_path}",
                )
            except Exception as e:
                logger.error(f"Error reading file {file_obj.file_path}: {e}", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"Error reading file: {str(e)}",
                )

            try:
                decoded = raw_content.decode("utf-8-sig")
            except UnicodeDecodeError:
                decoded = raw_content.decode("utf-8", errors="ignore")

    if not decoded or not decoded.strip():
        raise HTTPException(
            status_code=400,
            detail="OCR text is empty or could not be decoded",
        )

    parsed_items, parse_errors = _parse_equipment_csv_text(decoded)

    if not parsed_items:
        raise HTTPException(
            status_code=400,
            detail="OCR text/CSV does not contain valid equipment rows",
        )

    response = await _bulk_create_equipment_items(
        items=parsed_items,
        skip_duplicates=True,
        current_user=current_user,
        db=db,
    )

    response.errors.extend(parse_errors)
    response.skipped += len(parse_errors)
    return response

@router.get("/{equipment_id}/violations")
async def get_equipment_violations(
    equipment_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[str] = None,
    severity: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить нарушения для конкретного оборудования"""
    await require_permission(current_user, "violations:read", db)
    
    # Проверяем существование оборудования
    eq_result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    equipment = eq_result.scalar_one_or_none()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    # Импортируем модель Violation если еще не импортирована
    try:
        from backend.models import Violation
    except ImportError:
        from ..models import Violation
    
    # Строим запрос нарушений
    query = select(Violation).where(Violation.equipment_id == equipment_id)
    
    if status:
        query = query.where(Violation.status == status)
    
    if severity:
        query = query.where(Violation.severity == severity)
    
    query = query.order_by(Violation.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    violations = result.scalars().all()
    
    # Формируем ответ
    violations_data = []
    for violation in violations:
        violations_data.append({
            "id": violation.id,
            "description": violation.description,
            "fnp_clause": violation.fnp_clause,
            "gost_clause": violation.gost_clause,
            "severity": violation.severity,
            "location": violation.location,
            "deadline": violation.deadline.isoformat() if violation.deadline else None,
            "status": violation.status,
            "resolved_at": violation.resolved_at.isoformat() if violation.resolved_at else None,
            "created_at": violation.created_at.isoformat()
        })
    
    return {
        "items": violations_data,
        "equipment": {
            "id": equipment.id,
            "equipment_type": equipment.equipment_type,
            "passport_number": equipment.passport_number,
            "position": equipment.position,
            "workshop": equipment.workshop
        }
    }