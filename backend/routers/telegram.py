from __future__ import annotations

import os
import secrets
import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, Response, UploadFile, status
from PIL import Image
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.audit import log_audit_event
    from backend.database import get_db
    from backend.models import (
        Equipment,
        File as FileModel,
        TelegramIngestEvent,
        User,
        UserActivity,
        Violation,
    )
except ImportError:
    from ..audit import log_audit_event
    from ..database import get_db
    from ..models import (
        Equipment,
        File as FileModel,
        TelegramIngestEvent,
        User,
        UserActivity,
        Violation,
    )


router = APIRouter(prefix="/api/telegram", tags=["telegram"])
UPLOAD_DIR = "uploads"
THUMBNAIL_DIR = os.path.join(UPLOAD_DIR, "thumbnails")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)


class TelegramDefectIngestRequest(BaseModel):
    event_key: Optional[str] = Field(default=None, max_length=255)
    telegram_chat_id: Optional[str] = Field(default=None, max_length=64)
    telegram_message_id: Optional[str] = Field(default=None, max_length=64)
    telegram_user_id: Optional[str] = Field(default=None, max_length=64)
    telegram_username: Optional[str] = Field(default=None, max_length=255)
    telegram_full_name: Optional[str] = Field(default=None, max_length=255)

    workshop: Optional[str] = Field(default=None, max_length=255)
    equipment_id: Optional[int] = None
    equipment_passport_number: Optional[str] = Field(default=None, max_length=255)
    equipment_inventory_number: Optional[str] = Field(default=None, max_length=255)

    violation_type: str = Field(min_length=2, max_length=500)
    description: str = Field(min_length=3)
    location: Optional[str] = Field(default=None, max_length=255)
    severity: str = "medium"
    deadline: Optional[datetime] = None

    file_ids: List[int] = Field(default_factory=list)
    attachment_meta: Dict[str, Any] = Field(default_factory=dict)

    reported_by_user_id: Optional[int] = None

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, value: str) -> str:
        allowed = {"low", "medium", "high", "critical"}
        normalized = (value or "").strip().lower()
        if normalized not in allowed:
            raise ValueError(f"Unsupported severity '{value}'. Allowed: {', '.join(sorted(allowed))}")
        return normalized

    @field_validator("file_ids")
    @classmethod
    def validate_file_ids(cls, value: List[int]) -> List[int]:
        if len(value) != len(set(value)):
            raise ValueError("file_ids must not contain duplicates")
        return value

    @model_validator(mode="after")
    def validate_equipment_selector(self) -> "TelegramDefectIngestRequest":
        equipment_id = self.equipment_id
        passport = (self.equipment_passport_number or "").strip()
        inventory = (self.equipment_inventory_number or "").strip()
        if equipment_id is None and not passport and not inventory:
            raise ValueError(
                "Provide equipment_id or equipment_passport_number or equipment_inventory_number"
            )
        return self


class TelegramDefectIngestResponse(BaseModel):
    status: str  # created | duplicate
    violation_id: int
    event_key: Optional[str] = None
    linked_files: int = 0
    source: str = "telegram"


class TelegramFileUploadResponse(BaseModel):
    file_id: int
    filename: str
    original_filename: str
    file_type: str
    mime_type: str
    file_size: int
    thumbnail_path: Optional[str] = None


class TelegramWorkshopItem(BaseModel):
    name: str


class TelegramEquipmentItem(BaseModel):
    id: int
    equipment_type: Optional[str] = None
    passport_number: Optional[str] = None
    inventory_number: Optional[str] = None
    workshop: Optional[str] = None
    position: Optional[str] = None
    label: str


def _is_telegram_ingest_enabled() -> bool:
    return os.getenv("ENABLE_TELEGRAM_INGEST", "false").strip().lower() == "true"


def _require_telegram_ingest_token(token: Optional[str]) -> None:
    expected_token = (os.getenv("TELEGRAM_INGEST_TOKEN") or "").strip()
    if not _is_telegram_ingest_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram ingest is disabled",
        )
    if not expected_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TELEGRAM_INGEST_TOKEN is not configured",
        )
    if not token or not secrets.compare_digest(token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid telegram ingest token",
        )


def _build_event_key(payload: TelegramDefectIngestRequest) -> Optional[str]:
    if payload.event_key and payload.event_key.strip():
        return payload.event_key.strip()
    if payload.telegram_chat_id and payload.telegram_message_id:
        return f"tg:{payload.telegram_chat_id}:{payload.telegram_message_id}"
    return None


def _detect_file_type(mime_type: str) -> str:
    if mime_type.startswith("image/"):
        return "photo"
    if mime_type == "application/pdf":
        return "pdf"
    if mime_type.startswith("video/"):
        return "video"
    return "document"


async def _create_thumbnail(file_path: str, output_path: str, size: tuple[int, int] = (200, 200)) -> bool:
    try:
        img = Image.open(file_path)
        img.thumbnail(size, Image.Resampling.LANCZOS)
        img.save(output_path, "JPEG", quality=85)
        return True
    except Exception:
        return False


def _create_thumbnail_bytes(content: bytes, size: tuple[int, int] = (200, 200)) -> Optional[bytes]:
    try:
        img = Image.open(io.BytesIO(content))
        img.thumbnail(size, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        img.convert("RGB").save(output, "JPEG", quality=85)
        return output.getvalue()
    except Exception:
        return None


def _equipment_label(equipment: Equipment) -> str:
    parts: List[str] = []
    if equipment.equipment_type:
        parts.append(str(equipment.equipment_type))
    if equipment.passport_number:
        parts.append(f"паспорт: {equipment.passport_number}")
    if equipment.inventory_number:
        parts.append(f"инв: {equipment.inventory_number}")
    if equipment.position:
        parts.append(f"позиция: {equipment.position}")
    if not parts:
        return f"Оборудование #{equipment.id}"
    return " | ".join(parts)


async def _resolve_equipment(payload: TelegramDefectIngestRequest, db: AsyncSession) -> Equipment:
    if payload.equipment_id is not None:
        result = await db.execute(select(Equipment).where(Equipment.id == payload.equipment_id))
        equipment = result.scalar_one_or_none()
        if not equipment:
            raise HTTPException(status_code=404, detail="Equipment not found by id")
        return equipment

    conditions = []
    passport = (payload.equipment_passport_number or "").strip()
    inventory = (payload.equipment_inventory_number or "").strip()
    workshop = (payload.workshop or "").strip()

    if passport:
        conditions.append(Equipment.passport_number == passport)
    if inventory:
        conditions.append(Equipment.inventory_number == inventory)
    if workshop:
        conditions.append(Equipment.workshop == workshop)

    query = select(Equipment)
    for condition in conditions:
        query = query.where(condition)

    result = await db.execute(query.limit(2))
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Equipment not found by provided identifiers")
    if len(rows) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Equipment lookup is ambiguous; provide equipment_id",
        )
    return rows[0]


async def _resolve_reporter(
    payload: TelegramDefectIngestRequest,
    db: AsyncSession,
) -> Optional[User]:
    if payload.reported_by_user_id is not None:
        result = await db.execute(select(User).where(User.id == payload.reported_by_user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="reported_by_user_id not found")
        return user

    if payload.telegram_user_id:
        result = await db.execute(select(User).where(User.telegram_user_id == payload.telegram_user_id))
        user = result.scalar_one_or_none()
        if user:
            return user

    return None


@router.get("/health")
async def telegram_ingest_health():
    configured = bool((os.getenv("TELEGRAM_INGEST_TOKEN") or "").strip())
    return {
        "enabled": _is_telegram_ingest_enabled(),
        "configured": configured,
    }


@router.get("/workshops", response_model=List[TelegramWorkshopItem])
async def list_workshops_for_telegram(
    x_telegram_ingest_token: Optional[str] = Header(default=None, alias="X-Telegram-Ingest-Token"),
    db: AsyncSession = Depends(get_db),
):
    _require_telegram_ingest_token(x_telegram_ingest_token)

    result = await db.execute(
        select(Equipment.workshop)
        .where(Equipment.workshop.is_not(None))
        .where(Equipment.workshop != "")
        .distinct()
        .order_by(Equipment.workshop.asc())
    )
    workshops = [row[0] for row in result.all() if row and row[0]]
    return [TelegramWorkshopItem(name=name) for name in workshops]


@router.get("/equipment", response_model=List[TelegramEquipmentItem])
async def list_equipment_for_telegram(
    workshop: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 200,
    x_telegram_ingest_token: Optional[str] = Header(default=None, alias="X-Telegram-Ingest-Token"),
    db: AsyncSession = Depends(get_db),
):
    _require_telegram_ingest_token(x_telegram_ingest_token)

    safe_limit = max(1, min(limit, 1000))
    query = select(Equipment)

    if workshop:
        query = query.where(Equipment.workshop == workshop.strip())

    if search and search.strip():
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Equipment.passport_number.ilike(pattern),
                Equipment.inventory_number.ilike(pattern),
                Equipment.equipment_type.ilike(pattern),
                Equipment.position.ilike(pattern),
            )
        )

    query = query.order_by(Equipment.id.desc()).limit(safe_limit)
    result = await db.execute(query)
    equipment_rows = result.scalars().all()

    return [
        TelegramEquipmentItem(
            id=item.id,
            equipment_type=item.equipment_type,
            passport_number=item.passport_number,
            inventory_number=item.inventory_number,
            workshop=item.workshop,
            position=item.position,
            label=_equipment_label(item),
        )
        for item in equipment_rows
    ]


@router.post(
    "/defects",
    response_model=TelegramDefectIngestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_defect_from_telegram(
    payload: TelegramDefectIngestRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    x_telegram_ingest_token: Optional[str] = Header(default=None, alias="X-Telegram-Ingest-Token"),
):
    _require_telegram_ingest_token(x_telegram_ingest_token)

    trace_id = getattr(request.state, "trace_id", None)
    event_key = _build_event_key(payload)

    if event_key:
        existing_event_result = await db.execute(
            select(TelegramIngestEvent).where(TelegramIngestEvent.event_key == event_key)
        )
        existing_event = existing_event_result.scalar_one_or_none()
        if existing_event:
            response.status_code = status.HTTP_200_OK
            return TelegramDefectIngestResponse(
                status="duplicate",
                violation_id=existing_event.violation_id,
                event_key=event_key,
                linked_files=0,
            )

    normalized_deadline = payload.deadline
    if normalized_deadline and normalized_deadline.tzinfo is not None:
        normalized_deadline = normalized_deadline.astimezone(timezone.utc).replace(tzinfo=None)

    if normalized_deadline and normalized_deadline < datetime.utcnow():
        raise HTTPException(status_code=400, detail="deadline must not be in the past")

    equipment = await _resolve_equipment(payload, db)
    reporter = await _resolve_reporter(payload, db)

    merged_attachment_meta: Dict[str, Any] = dict(payload.attachment_meta or {})
    merged_attachment_meta.setdefault("telegram", {})
    merged_attachment_meta["telegram"].update(
        {
            "chat_id": payload.telegram_chat_id,
            "message_id": payload.telegram_message_id,
            "user_id": payload.telegram_user_id,
            "username": payload.telegram_username,
            "full_name": payload.telegram_full_name,
            "event_key": event_key,
        }
    )
    if payload.file_ids:
        merged_attachment_meta["file_ids"] = payload.file_ids

    violation = Violation(
        inspection_id=None,
        equipment_id=equipment.id,
        description=payload.description.strip(),
        severity=payload.severity,
        violation_type=payload.violation_type.strip(),
        source="telegram",
        reported_by=reporter.id if reporter else None,
        attachment_meta=merged_attachment_meta,
        location=(payload.location or "").strip() or None,
        deadline=normalized_deadline,
        status="open",
        created_by=reporter.id if reporter else None,
    )
    if normalized_deadline:
        violation.deadline_source = "manual"
        violation.deadline_rule_id = None

    db.add(violation)
    await db.flush()

    linked_files = 0
    if payload.file_ids:
        file_result = await db.execute(select(FileModel).where(FileModel.id.in_(payload.file_ids)))
        files = file_result.scalars().all()
        found_file_ids = {f.id for f in files}
        missing_ids = sorted(set(payload.file_ids) - found_file_ids)
        if missing_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Some file_ids were not found: {missing_ids}",
            )
        for file_record in files:
            file_record.violation_id = violation.id
            if file_record.equipment_id is None:
                file_record.equipment_id = equipment.id
        linked_files = len(files)

    if event_key:
        db.add(
            TelegramIngestEvent(
                event_key=event_key,
                violation_id=violation.id,
                telegram_chat_id=payload.telegram_chat_id,
                telegram_message_id=payload.telegram_message_id,
                telegram_user_id=payload.telegram_user_id,
            )
        )

    db.add(
        UserActivity(
            user_id=reporter.id if reporter else None,
            action_type="create",
            entity_type="violation",
            entity_id=violation.id,
            description=f"Telegram ingest created violation {violation.id}",
        )
    )

    await log_audit_event(
        db,
        entity_type="violation",
        entity_id=violation.id,
        action="CREATE",
        field_changes={
            "status": {"old": None, "new": "open"},
            "source": {"old": None, "new": "telegram"},
            "severity": {"old": None, "new": violation.severity},
            "deadline": {
                "old": None,
                "new": violation.deadline.isoformat() if violation.deadline else None,
            },
            "description": {"old": None, "new": violation.description},
        },
        performed_by=reporter.id if reporter else None,
        source="telegram",
        trace_id=trace_id,
    )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        if event_key:
            existing_event_result = await db.execute(
                select(TelegramIngestEvent).where(TelegramIngestEvent.event_key == event_key)
            )
            existing_event = existing_event_result.scalar_one_or_none()
            if existing_event:
                response.status_code = status.HTTP_200_OK
                return TelegramDefectIngestResponse(
                    status="duplicate",
                    violation_id=existing_event.violation_id,
                    event_key=event_key,
                    linked_files=0,
                )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to persist telegram defect event",
        )

    return TelegramDefectIngestResponse(
        status="created",
        violation_id=violation.id,
        event_key=event_key,
        linked_files=linked_files,
    )


@router.post(
    "/files",
    response_model=TelegramFileUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file_from_telegram(
    request: Request,
    file: UploadFile = File(...),
    description: Optional[str] = Form(default=None),
    equipment_id: Optional[int] = Form(default=None),
    x_telegram_ingest_token: Optional[str] = Header(default=None, alias="X-Telegram-Ingest-Token"),
    db: AsyncSession = Depends(get_db),
):
    _require_telegram_ingest_token(x_telegram_ingest_token)

    if equipment_id is not None:
        equipment_result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
        if equipment_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Equipment not found by id")

    mime_type = file.content_type or "application/octet-stream"
    file_type = _detect_file_type(mime_type)

    safe_original_name = os.path.basename(file.filename or "telegram_file")
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"tg_{timestamp}_{safe_original_name}"
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")
    file_size = len(content)
    thumbnail_data = _create_thumbnail_bytes(content) if file_type == "photo" else None
    file_path = f"db://files/{filename}"
    thumbnail_path = f"db://files/{filename}/thumbnail" if thumbnail_data else None

    trace_id = getattr(request.state, "trace_id", None)

    file_record = FileModel(
        filename=filename,
        original_filename=safe_original_name,
        description=description,
        file_type=file_type,
        mime_type=mime_type,
        file_size=file_size,
        file_path=file_path,
        thumbnail_path=thumbnail_path,
        storage_backend="database",
        data=content,
        thumbnail_data=thumbnail_data,
        equipment_id=equipment_id,
        uploaded_by=None,
    )
    db.add(file_record)
    await db.flush()

    db.add(
        UserActivity(
            user_id=None,
            action_type="create",
            entity_type="file",
            entity_id=file_record.id,
            description=f"Telegram ingest uploaded file {safe_original_name}; trace_id={trace_id}",
        )
    )

    await db.commit()
    await db.refresh(file_record)

    return TelegramFileUploadResponse(
        file_id=file_record.id,
        filename=file_record.filename,
        original_filename=file_record.original_filename,
        file_type=file_record.file_type,
        mime_type=file_record.mime_type,
        file_size=file_record.file_size,
        thumbnail_path=file_record.thumbnail_path,
    )
