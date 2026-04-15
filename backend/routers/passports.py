from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

try:
    from backend.audit import build_field_changes, log_audit_event
    from backend.auth import get_current_user, require_permission
    from backend.database import get_db
    from backend.passport_sync import apply_passport_draft_to_equipment
    from backend.models import (
        Act,
        Equipment,
        EquipmentPassport,
        EquipmentPassportDocument,
        EquipmentPassportEvent,
        EquipmentPassportVersion,
        File as FileModel,
        Inspection,
        Task,
        User,
        UserActivity,
        Violation,
    )
except ImportError:
    from ..audit import build_field_changes, log_audit_event
    from ..auth import get_current_user, require_permission
    from ..database import get_db
    from ..passport_sync import apply_passport_draft_to_equipment
    from ..models import (
        Act,
        Equipment,
        EquipmentPassport,
        EquipmentPassportDocument,
        EquipmentPassportEvent,
        EquipmentPassportVersion,
        File as FileModel,
        Inspection,
        Task,
        User,
        UserActivity,
        Violation,
    )

router = APIRouter(prefix="/api/passports", tags=["passports"])

PASSPORT_STATUSES = {"draft", "review", "approved", "archived"}
DOCUMENT_STATUSES = {"active", "expired", "archived"}
EVENT_SOURCES = {"manual", "system", "ai"}


def _role_names(user: User) -> set[str]:
    return {
        user_role.role.name
        for user_role in (user.roles or [])
        if getattr(user_role, "role", None) and getattr(user_role.role, "name", None)
    }


def _ensure_publish_access(user: User) -> None:
    if "admin" not in _role_names(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Публикация версии паспорта доступна только администратору",
        )


def _format_date_short(value: Optional[datetime]) -> str:
    if not value:
        return ""
    return value.strftime("%Y-%m-%d")


def _default_draft_data(equipment: Equipment) -> Dict[str, Any]:
    return {
        "general": {
            "passport_number": equipment.passport_number or "",
            "equipment_type": equipment.equipment_type or "",
            "registration_number": equipment.registration_number or "",
            "factory_number": equipment.factory_number or "",
            "inventory_number": equipment.inventory_number or "",
            "workshop": equipment.workshop or "",
            "installation_location": equipment.installation_location or "",
            "manufacturer": equipment.manufacturer or "",
            "owner_department": equipment.workshop or "",
            "responsible_person": "",
            "commissioning_order": "",
            "notes": "",
        },
        "technical": {
            "load_capacity_t": str(equipment.load_capacity) if equipment.load_capacity is not None else "",
            "span_m": "",
            "lifting_height_m": "",
            "duty_group": "",
            "power_supply": "",
            "control_mode": "",
            "climate_version": "",
            "factory_year": "",
        },
        "compliance": {
            "rostekhnadzor_registered": bool(equipment.rostekhnadzor_registered),
            "registration_date": "",
            "expertise_date": _format_date_short(equipment.expertise_date),
            "operation_permit_until": _format_date_short(equipment.operation_permit_until),
            "restrictions": "",
            "safety_devices": "",
            "epb_details": equipment.epb_positive_details or "",
        },
        "maintenance": {
            "service_interval_days": "",
            "last_major_repair_at": "",
            "maintenance_notes": "",
            "modernization_notes": "",
        },
        "notes": {
            "operating_notes": "",
            "defect_notes": "",
            "spare_parts_notes": "",
        },
    }


def _deep_merge_dicts(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge_dicts(result[key], value)
        else:
            result[key] = value
    return result


def _is_blank_value(value: Any) -> bool:
    return value in (None, "", [], {})


def _merge_with_equipment_defaults(defaults: Dict[str, Any], saved: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(defaults)
    for key, value in (saved or {}).items():
        default_value = result.get(key)
        if isinstance(default_value, dict) and isinstance(value, dict):
            result[key] = _merge_with_equipment_defaults(default_value, value)
        elif _is_blank_value(value) and not _is_blank_value(default_value):
            result[key] = default_value
        else:
            result[key] = value
    return result


def _normalize_passport_status(raw_status: Optional[str], fallback: str = "draft") -> str:
    value = (raw_status or fallback).strip().lower()
    if value not in PASSPORT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"passport_status must be one of: {', '.join(sorted(PASSPORT_STATUSES))}",
        )
    return value


def _normalize_document_status(raw_status: Optional[str]) -> str:
    value = (raw_status or "active").strip().lower()
    if value not in DOCUMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"document status must be one of: {', '.join(sorted(DOCUMENT_STATUSES))}",
        )
    return value


def _normalize_event_source(raw_source: Optional[str]) -> str:
    value = (raw_source or "manual").strip().lower()
    if value not in EVENT_SOURCES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"event source must be one of: {', '.join(sorted(EVENT_SOURCES))}",
        )
    return value


def _calculate_completeness(draft_data: Dict[str, Any], document_count: int, version_count: int) -> float:
    tracked_fields = [
        ("general", "passport_number"),
        ("general", "equipment_type"),
        ("general", "responsible_person"),
        ("general", "owner_department"),
        ("technical", "load_capacity_t"),
        ("technical", "duty_group"),
        ("technical", "power_supply"),
        ("technical", "climate_version"),
        ("compliance", "safety_devices"),
        ("maintenance", "service_interval_days"),
    ]
    total = len(tracked_fields) + 2
    filled = 0
    for section, field in tracked_fields:
        section_data = draft_data.get(section) or {}
        value = section_data.get(field)
        if isinstance(value, bool):
            if value:
                filled += 1
        elif value not in (None, "", [], {}):
            filled += 1
    if document_count > 0:
        filled += 1
    if version_count > 0:
        filled += 1
    return round((filled / total) * 100, 1) if total else 0.0


def _equipment_payload(equipment: Equipment) -> Dict[str, Any]:
    return {
        "id": equipment.id,
        "equipment_type": equipment.equipment_type,
        "passport_number": equipment.passport_number,
        "registration_number": equipment.registration_number,
        "factory_number": equipment.factory_number,
        "inventory_number": equipment.inventory_number,
        "workshop": equipment.workshop,
        "installation_location": equipment.installation_location,
        "manufacturer": equipment.manufacturer,
        "load_capacity": equipment.load_capacity,
        "status": equipment.status,
        "pto_date": equipment.pto_date.isoformat() if equipment.pto_date else None,
        "cto_date": equipment.cto_date.isoformat() if equipment.cto_date else None,
        "expertise_date": equipment.expertise_date.isoformat() if equipment.expertise_date else None,
        "operation_permit_until": equipment.operation_permit_until.isoformat() if equipment.operation_permit_until else None,
        "operation_banned": equipment.operation_banned,
        "rostekhnadzor_registered": equipment.rostekhnadzor_registered,
    }


def _document_payload(document: EquipmentPassportDocument) -> Dict[str, Any]:
    file_model = document.file
    return {
        "id": document.id,
        "file_id": document.file_id,
        "document_type": document.document_type,
        "title": document.title,
        "document_number": document.document_number,
        "issuer": document.issuer,
        "issue_date": document.issue_date.isoformat() if document.issue_date else None,
        "expiry_date": document.expiry_date.isoformat() if document.expiry_date else None,
        "status": document.status,
        "is_required": document.is_required,
        "notes": document.notes,
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "updated_at": document.updated_at.isoformat() if document.updated_at else None,
        "uploaded_by": document.uploaded_by,
        "file": {
            "id": file_model.id,
            "filename": file_model.filename,
            "original_filename": file_model.original_filename,
            "description": file_model.description,
            "mime_type": file_model.mime_type,
            "file_type": file_model.file_type,
            "file_size": file_model.file_size,
            "created_at": file_model.created_at.isoformat() if file_model.created_at else None,
        } if file_model else None,
    }


def _version_payload(version: EquipmentPassportVersion) -> Dict[str, Any]:
    return {
        "id": version.id,
        "version_number": version.version_number,
        "status": version.status,
        "change_summary": version.change_summary,
        "pdf_file_id": version.pdf_file_id,
        "created_at": version.created_at.isoformat() if version.created_at else None,
        "created_by": version.created_by,
        "snapshot": version.snapshot,
    }


def _event_payload(event: EquipmentPassportEvent) -> Dict[str, Any]:
    return {
        "id": event.id,
        "event_type": event.event_type,
        "title": event.title,
        "description": event.description,
        "event_date": event.event_date.isoformat() if event.event_date else None,
        "source": event.source,
        "related_entity_type": event.related_entity_type,
        "related_entity_id": event.related_entity_id,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "created_by": event.created_by,
    }


def _activity(user_id: int, action: str, description: str, entity_id: Optional[int] = None) -> UserActivity:
    return UserActivity(
        user_id=user_id,
        action_type=action,
        entity_type="equipment_passport",
        entity_id=entity_id,
        description=description,
    )

async def _get_equipment_or_404(db: AsyncSession, equipment_id: int) -> Equipment:
    result = await db.execute(
        select(Equipment)
        .options(
            selectinload(Equipment.passport).selectinload(EquipmentPassport.documents).selectinload(EquipmentPassportDocument.file),
            selectinload(Equipment.passport).selectinload(EquipmentPassport.versions),
            selectinload(Equipment.passport).selectinload(EquipmentPassport.events),
        )
        .where(Equipment.id == equipment_id)
    )
    equipment = result.scalar_one_or_none()
    if not equipment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Оборудование не найдено")
    return equipment


async def _get_or_create_passport(db: AsyncSession, equipment: Equipment, user_id: Optional[int] = None) -> EquipmentPassport:
    passport_result = await db.execute(
        select(EquipmentPassport).where(EquipmentPassport.equipment_id == equipment.id)
    )
    passport = passport_result.scalar_one_or_none()
    if passport:
        return passport

    passport = EquipmentPassport(
        equipment_id=equipment.id,
        passport_status="draft",
        draft_data=_default_draft_data(equipment),
        completeness_percent=0.0,
        updated_by=user_id,
    )
    db.add(passport)
    await db.flush()
    return passport


async def _load_passport_related(
    db: AsyncSession,
    passport_id: int,
) -> tuple[List[EquipmentPassportDocument], List[EquipmentPassportVersion], List[EquipmentPassportEvent]]:
    documents_result = await db.execute(
        select(EquipmentPassportDocument)
        .options(selectinload(EquipmentPassportDocument.file))
        .where(EquipmentPassportDocument.passport_id == passport_id)
    )
    versions_result = await db.execute(
        select(EquipmentPassportVersion).where(EquipmentPassportVersion.passport_id == passport_id)
    )
    events_result = await db.execute(
        select(EquipmentPassportEvent).where(EquipmentPassportEvent.passport_id == passport_id)
    )

    documents = sorted(
        documents_result.scalars().all(),
        key=lambda item: item.created_at or datetime.min,
        reverse=True,
    )
    versions = sorted(
        versions_result.scalars().all(),
        key=lambda item: item.version_number,
        reverse=True,
    )
    events = sorted(
        events_result.scalars().all(),
        key=lambda item: item.event_date or datetime.min,
        reverse=True,
    )
    return documents, versions, events


async def _collect_aggregates(db: AsyncSession, equipment_id: int) -> Dict[str, Any]:
    violations_result = await db.execute(select(Violation).where(Violation.equipment_id == equipment_id).order_by(Violation.created_at.desc()))
    inspections_result = await db.execute(select(Inspection).where(Inspection.equipment_id == equipment_id).order_by(Inspection.created_at.desc()))
    acts_result = await db.execute(select(Act).where(Act.equipment_id == equipment_id).order_by(Act.created_at.desc()))
    tasks_result = await db.execute(select(Task).where(Task.equipment_id == equipment_id).order_by(Task.created_at.desc()))
    files_result = await db.execute(select(FileModel).where(FileModel.equipment_id == equipment_id).order_by(FileModel.created_at.desc()))

    violations = violations_result.scalars().all()
    inspections = inspections_result.scalars().all()
    acts = acts_result.scalars().all()
    tasks = tasks_result.scalars().all()
    files = files_result.scalars().all()

    open_violation_statuses = {"open", "in_progress", "pending"}
    closed_task_statuses = {"done", "completed", "closed", "resolved"}
    now = datetime.utcnow()

    violations_open = [v for v in violations if (v.status or "open") in open_violation_statuses]
    violations_overdue = [v for v in violations_open if v.is_overdue or (v.deadline is not None and v.deadline < now)]
    open_tasks = [task for task in tasks if (task.status or "open").lower() not in closed_task_statuses]

    return {
        "violations_total": len(violations),
        "violations_open": len(violations_open),
        "violations_overdue": len(violations_overdue),
        "inspections_total": len(inspections),
        "acts_total": len(acts),
        "tasks_total": len(tasks),
        "tasks_open": len(open_tasks),
        "files_total": len(files),
        "last_inspection_at": inspections[0].created_at.isoformat() if inspections else None,
        "last_violation_at": violations[0].created_at.isoformat() if violations else None,
        "last_act_at": acts[0].created_at.isoformat() if acts else None,
        "last_file_at": files[0].created_at.isoformat() if files else None,
    }


def _build_snapshot(
    equipment: Equipment,
    passport: EquipmentPassport,
    documents: List[EquipmentPassportDocument],
    events: List[EquipmentPassportEvent],
    aggregates: Dict[str, Any],
    completeness_percent: float,
) -> Dict[str, Any]:
    return {
        "captured_at": datetime.utcnow().isoformat(),
        "equipment": _equipment_payload(equipment),
        "passport": {
            "passport_id": passport.id,
            "passport_status": passport.passport_status,
            "completeness_percent": completeness_percent,
            "draft_data": passport.draft_data or _default_draft_data(equipment),
        },
        "documents": [_document_payload(document) for document in documents],
        "events": [_event_payload(event) for event in events],
        "aggregates": aggregates,
    }


async def _build_passport_response(db: AsyncSession, equipment: Equipment) -> Dict[str, Any]:
    passport = await _get_or_create_passport(db, equipment)
    documents, versions, events = await _load_passport_related(db, passport.id)
    draft_data = _merge_with_equipment_defaults(_default_draft_data(equipment), passport.draft_data or {})
    completeness_percent = _calculate_completeness(draft_data, len(documents), len(versions))
    passport.draft_data = draft_data
    passport.completeness_percent = completeness_percent
    aggregates = await _collect_aggregates(db, equipment.id)
    current_version = next((version for version in versions if version.id == passport.current_version_id), None)

    return {
        "passport_id": passport.id,
        "equipment": _equipment_payload(equipment),
        "passport_status": passport.passport_status,
        "completeness_percent": completeness_percent,
        "current_version_id": passport.current_version_id,
        "current_version_number": current_version.version_number if current_version else None,
        "last_published_at": passport.last_published_at.isoformat() if passport.last_published_at else None,
        "approved_by": passport.approved_by,
        "approved_at": passport.approved_at.isoformat() if passport.approved_at else None,
        "draft_data": draft_data,
        "documents": [_document_payload(document) for document in documents],
        "versions": [_version_payload(version) for version in versions],
        "events": [_event_payload(event) for event in events],
        "aggregates": aggregates,
    }


class PassportDraftUpdateRequest(BaseModel):
    draft_data: Dict[str, Any]
    passport_status: Optional[str] = None


class PassportPublishRequest(BaseModel):
    change_summary: Optional[str] = Field(default=None, max_length=2000)


class PassportDocumentCreateRequest(BaseModel):
    file_id: Optional[int] = None
    document_type: str = Field(..., min_length=1, max_length=100)
    title: str = Field(..., min_length=1, max_length=255)
    document_number: Optional[str] = Field(default=None, max_length=255)
    issuer: Optional[str] = Field(default=None, max_length=255)
    issue_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    status: Optional[str] = "active"
    is_required: bool = False
    notes: Optional[str] = None


class PassportDocumentUpdateRequest(BaseModel):
    file_id: Optional[int] = None
    document_type: Optional[str] = Field(default=None, min_length=1, max_length=100)
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    document_number: Optional[str] = Field(default=None, max_length=255)
    issuer: Optional[str] = Field(default=None, max_length=255)
    issue_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    status: Optional[str] = None
    is_required: Optional[bool] = None
    notes: Optional[str] = None


class PassportEventCreateRequest(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=100)
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    event_date: Optional[datetime] = None
    source: Optional[str] = "manual"
    related_entity_type: Optional[str] = Field(default=None, max_length=100)
    related_entity_id: Optional[int] = None


class PassportEventUpdateRequest(BaseModel):
    event_type: Optional[str] = Field(default=None, min_length=1, max_length=100)
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    event_date: Optional[datetime] = None
    source: Optional[str] = None
    related_entity_type: Optional[str] = Field(default=None, max_length=100)
    related_entity_id: Optional[int] = None

@router.get("/equipment/{equipment_id}")
async def get_equipment_passport(
    equipment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:read", db)
    equipment = await _get_equipment_or_404(db, equipment_id)
    payload = await _build_passport_response(db, equipment)
    await db.commit()
    return payload


@router.put("/equipment/{equipment_id}/draft")
async def update_equipment_passport_draft(
    equipment_id: int,
    request_body: PassportDraftUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:update", db)
    equipment = await _get_equipment_or_404(db, equipment_id)
    passport = await _get_or_create_passport(db, equipment, current_user.id)

    before_draft = passport.draft_data or _default_draft_data(equipment)
    before_status = passport.passport_status
    merged = _merge_with_equipment_defaults(_default_draft_data(equipment), before_draft)
    merged = _deep_merge_dicts(merged, request_body.draft_data or {})

    merged_general = merged.get("general") or {}
    new_passport_number = (merged_general.get("passport_number") or "").strip()
    if new_passport_number and new_passport_number != (equipment.passport_number or "").strip():
        existing_passport = await db.execute(
            select(Equipment.id).where(Equipment.passport_number == new_passport_number, Equipment.id != equipment.id)
        )
        if existing_passport.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passport number already exists")

    new_inventory_number = (merged_general.get("inventory_number") or "").strip()
    if new_inventory_number and new_inventory_number != (equipment.inventory_number or "").strip():
        existing_inventory = await db.execute(
            select(Equipment.id).where(Equipment.inventory_number == new_inventory_number, Equipment.id != equipment.id)
        )
        if existing_inventory.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inventory number already exists")

    passport.draft_data = merged
    passport.passport_status = _normalize_passport_status(request_body.passport_status, "draft")
    passport.updated_by = current_user.id
    passport.updated_at = datetime.utcnow()
    apply_passport_draft_to_equipment(equipment, merged)
    equipment.updated_at = datetime.utcnow()
    documents, versions, _ = await _load_passport_related(db, passport.id)
    passport.completeness_percent = _calculate_completeness(merged, len(documents), len(versions))

    db.add(_activity(current_user.id, "update", f"Обновлен черновик паспорта оборудования #{equipment.id}", passport.id))
    await log_audit_event(
        db,
        entity_type="equipment_passport",
        entity_id=passport.id,
        action="UPDATE_DRAFT",
        performed_by=current_user.id,
        source="ui",
        trace_id=getattr(request.state, "trace_id", None),
        field_changes=build_field_changes(
            {"draft_data": before_draft, "passport_status": before_status},
            {"draft_data": merged, "passport_status": passport.passport_status},
        ),
    )

    await db.commit()
    refreshed_equipment = await _get_equipment_or_404(db, equipment_id)
    return await _build_passport_response(db, refreshed_equipment)


@router.post("/equipment/{equipment_id}/publish")
async def publish_equipment_passport(
    equipment_id: int,
    request_body: PassportPublishRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:update", db)
    _ensure_publish_access(current_user)

    equipment = await _get_equipment_or_404(db, equipment_id)
    passport = await _get_or_create_passport(db, equipment, current_user.id)

    documents, versions, events = await _load_passport_related(db, passport.id)
    draft_data = _merge_with_equipment_defaults(_default_draft_data(equipment), passport.draft_data or {})
    completeness_percent = _calculate_completeness(draft_data, len(documents), len(versions))
    aggregates = await _collect_aggregates(db, equipment.id)
    next_version_number = (versions[0].version_number + 1) if versions else 1
    snapshot = _build_snapshot(equipment, passport, documents, events, aggregates, completeness_percent)

    version = EquipmentPassportVersion(
        passport_id=passport.id,
        version_number=next_version_number,
        status="approved",
        snapshot=snapshot,
        change_summary=request_body.change_summary.strip() if request_body.change_summary else None,
        created_by=current_user.id,
    )
    db.add(version)
    await db.flush()

    previous_version_id = passport.current_version_id
    passport.current_version_id = version.id
    passport.passport_status = "approved"
    passport.last_published_at = datetime.utcnow()
    passport.approved_by = current_user.id
    passport.approved_at = datetime.utcnow()
    passport.updated_by = current_user.id
    passport.updated_at = datetime.utcnow()
    passport.draft_data = draft_data
    passport.completeness_percent = _calculate_completeness(draft_data, len(documents), len(versions) + 1)

    db.add(_activity(current_user.id, "create", f"Опубликована версия {next_version_number} паспорта оборудования #{equipment.id}", passport.id))
    await log_audit_event(
        db,
        entity_type="equipment_passport",
        entity_id=passport.id,
        action="PUBLISH_VERSION",
        performed_by=current_user.id,
        source="ui",
        trace_id=getattr(request.state, "trace_id", None),
        field_changes={
            "current_version_id": {"old": previous_version_id, "new": version.id},
            "version_number": {"old": next_version_number - 1 if next_version_number > 1 else None, "new": next_version_number},
            "change_summary": {"old": None, "new": version.change_summary},
        },
    )

    await db.commit()
    refreshed_equipment = await _get_equipment_or_404(db, equipment_id)
    return await _build_passport_response(db, refreshed_equipment)


@router.post("/equipment/{equipment_id}/documents", status_code=status.HTTP_201_CREATED)
async def create_passport_document(
    equipment_id: int,
    request_body: PassportDocumentCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:update", db)
    equipment = await _get_equipment_or_404(db, equipment_id)
    passport = await _get_or_create_passport(db, equipment, current_user.id)

    if request_body.file_id is not None:
        file_result = await db.execute(select(FileModel).where(FileModel.id == request_body.file_id))
        if not file_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")

    document = EquipmentPassportDocument(
        passport_id=passport.id,
        file_id=request_body.file_id,
        document_type=request_body.document_type.strip(),
        title=request_body.title.strip(),
        document_number=request_body.document_number.strip() if request_body.document_number else None,
        issuer=request_body.issuer.strip() if request_body.issuer else None,
        issue_date=request_body.issue_date,
        expiry_date=request_body.expiry_date,
        status=_normalize_document_status(request_body.status),
        is_required=request_body.is_required,
        notes=request_body.notes.strip() if request_body.notes else None,
        uploaded_by=current_user.id,
    )
    db.add(document)
    await db.flush()
    documents, versions, _ = await _load_passport_related(db, passport.id)

    passport.completeness_percent = _calculate_completeness(
        _merge_with_equipment_defaults(_default_draft_data(equipment), passport.draft_data or {}),
        len(documents),
        len(versions),
    )
    passport.updated_by = current_user.id
    passport.updated_at = datetime.utcnow()

    db.add(_activity(current_user.id, "create", f"Добавлен документ паспорта: {document.title}", passport.id))
    await log_audit_event(
        db,
        entity_type="equipment_passport_document",
        entity_id=document.id,
        action="CREATE",
        performed_by=current_user.id,
        source="ui",
        trace_id=getattr(request.state, "trace_id", None),
        field_changes={"title": {"old": None, "new": document.title}},
    )

    await db.commit()
    refreshed_equipment = await _get_equipment_or_404(db, equipment_id)
    return await _build_passport_response(db, refreshed_equipment)

@router.put("/documents/{document_id}")
async def update_passport_document(
    document_id: int,
    request_body: PassportDocumentUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:update", db)
    result = await db.execute(
        select(EquipmentPassportDocument)
        .options(selectinload(EquipmentPassportDocument.passport), selectinload(EquipmentPassportDocument.file))
        .where(EquipmentPassportDocument.id == document_id)
    )
    document = result.scalar_one_or_none()
    if not document or not document.passport:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Документ паспорта не найден")

    before = _document_payload(document)
    data = request_body.dict(exclude_unset=True)
    if "status" in data:
        data["status"] = _normalize_document_status(data["status"])
    for field, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(document, field, value)
    document.updated_at = datetime.utcnow()

    equipment_id = document.passport.equipment_id
    db.add(_activity(current_user.id, "update", f"Обновлен документ паспорта: {document.title}", document.passport_id))
    await log_audit_event(
        db,
        entity_type="equipment_passport_document",
        entity_id=document.id,
        action="UPDATE",
        performed_by=current_user.id,
        source="ui",
        trace_id=getattr(request.state, "trace_id", None),
        field_changes=build_field_changes(before, _document_payload(document)),
    )

    await db.commit()
    refreshed_equipment = await _get_equipment_or_404(db, equipment_id)
    return await _build_passport_response(db, refreshed_equipment)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passport_document(
    document_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:update", db)
    result = await db.execute(
        select(EquipmentPassportDocument)
        .options(selectinload(EquipmentPassportDocument.passport))
        .where(EquipmentPassportDocument.id == document_id)
    )
    document = result.scalar_one_or_none()
    if not document or not document.passport:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Документ паспорта не найден")

    title = document.title
    await log_audit_event(
        db,
        entity_type="equipment_passport_document",
        entity_id=document.id,
        action="DELETE",
        performed_by=current_user.id,
        source="ui",
        trace_id=getattr(request.state, "trace_id", None),
        field_changes={"title": {"old": title, "new": None}},
    )
    db.add(_activity(current_user.id, "delete", f"Удален документ паспорта: {title}", document.passport_id))
    await db.delete(document)
    await db.commit()
    return None


@router.post("/equipment/{equipment_id}/events", status_code=status.HTTP_201_CREATED)
async def create_passport_event(
    equipment_id: int,
    request_body: PassportEventCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:update", db)
    equipment = await _get_equipment_or_404(db, equipment_id)
    passport = await _get_or_create_passport(db, equipment, current_user.id)

    event = EquipmentPassportEvent(
        passport_id=passport.id,
        equipment_id=equipment.id,
        event_type=request_body.event_type.strip(),
        title=request_body.title.strip(),
        description=request_body.description.strip() if request_body.description else None,
        event_date=request_body.event_date or datetime.utcnow(),
        source=_normalize_event_source(request_body.source),
        related_entity_type=request_body.related_entity_type.strip() if request_body.related_entity_type else None,
        related_entity_id=request_body.related_entity_id,
        created_by=current_user.id,
    )
    db.add(event)
    db.add(_activity(current_user.id, "create", f"Добавлено событие паспорта: {event.title}", passport.id))
    await db.flush()

    await log_audit_event(
        db,
        entity_type="equipment_passport_event",
        entity_id=event.id,
        action="CREATE",
        performed_by=current_user.id,
        source="ui",
        trace_id=getattr(request.state, "trace_id", None),
        field_changes={"title": {"old": None, "new": event.title}},
    )

    await db.commit()
    refreshed_equipment = await _get_equipment_or_404(db, equipment_id)
    return await _build_passport_response(db, refreshed_equipment)


@router.put("/events/{event_id}")
async def update_passport_event(
    event_id: int,
    request_body: PassportEventUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:update", db)
    result = await db.execute(
        select(EquipmentPassportEvent)
        .options(selectinload(EquipmentPassportEvent.passport))
        .where(EquipmentPassportEvent.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event or not event.passport:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Событие паспорта не найдено")

    before = _event_payload(event)
    data = request_body.dict(exclude_unset=True)
    if "source" in data:
        data["source"] = _normalize_event_source(data["source"])
    for field, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(event, field, value)

    db.add(_activity(current_user.id, "update", f"Обновлено событие паспорта: {event.title}", event.passport_id))
    await log_audit_event(
        db,
        entity_type="equipment_passport_event",
        entity_id=event.id,
        action="UPDATE",
        performed_by=current_user.id,
        source="ui",
        trace_id=getattr(request.state, "trace_id", None),
        field_changes=build_field_changes(before, _event_payload(event)),
    )

    await db.commit()
    refreshed_equipment = await _get_equipment_or_404(db, event.equipment_id)
    return await _build_passport_response(db, refreshed_equipment)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_passport_event(
    event_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:update", db)
    result = await db.execute(
        select(EquipmentPassportEvent)
        .options(selectinload(EquipmentPassportEvent.passport))
        .where(EquipmentPassportEvent.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event or not event.passport:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Событие паспорта не найдено")

    title = event.title
    await log_audit_event(
        db,
        entity_type="equipment_passport_event",
        entity_id=event.id,
        action="DELETE",
        performed_by=current_user.id,
        source="ui",
        trace_id=getattr(request.state, "trace_id", None),
        field_changes={"title": {"old": title, "new": None}},
    )
    db.add(_activity(current_user.id, "delete", f"Удалено событие паспорта: {title}", event.passport_id))
    await db.delete(event)
    await db.commit()
    return None
