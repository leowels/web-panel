
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

try:
    from backend.audit import build_field_changes, log_audit_event
    from backend.auth import get_current_user, require_permission
    from backend.database import get_db
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
OPEN_VIOLATION_STATUSES = {"open", "in_progress", "pending"}
CLOSED_TASK_STATUSES = {"done", "completed", "closed", "resolved"}


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


def _stringify_number(value: Optional[float]) -> str:
    if value is None:
        return ""
    if int(value) == value:
        return str(int(value))
    return str(value)


def _default_profile_data(equipment: Equipment) -> Dict[str, Any]:
    return {
        "identity": {
            "passport_number": equipment.passport_number or "",
            "equipment_type": equipment.equipment_type or "",
            "registration_number": equipment.registration_number or "",
            "factory_number": equipment.factory_number or "",
            "inventory_number": equipment.inventory_number or "",
            "manufacturer": equipment.manufacturer or "",
            "workshop": equipment.workshop or "",
            "installation_location": equipment.installation_location or "",
            "status": equipment.status or "active",
            "owner_department": equipment.workshop or "",
            "responsible_person": "",
            "commissioning_date": _format_date_short(equipment.installation_date),
            "commissioning_order": "",
        },
        "specifications": {
            "load_capacity_t": _stringify_number(equipment.load_capacity),
            "span_m": "",
            "lifting_height_m": "",
            "duty_group": "",
            "control_mode": "",
            "power_supply": "",
            "climate_version": "",
            "factory_year": "",
            "drive_type": "",
            "notes": "",
        },
        "supervision": {
            "rostekhnadzor_registered": bool(equipment.rostekhnadzor_registered),
            "registration_date": "",
            "expertise_date": _format_date_short(equipment.expertise_date),
            "operation_permit_until": _format_date_short(equipment.operation_permit_until),
            "operation_banned": bool(equipment.operation_banned),
            "epb_details": equipment.epb_positive_details or "",
            "restrictions": "",
            "safety_devices": "",
        },
        "service": {
            "pto_date": _format_date_short(equipment.pto_date),
            "cto_date": _format_date_short(equipment.cto_date),
            "service_interval_days": "",
            "last_major_repair_at": "",
            "maintenance_notes": "",
            "modernization_notes": "",
            "service_contract": "",
        },
        "notes": {
            "operating_notes": "",
            "defect_notes": "",
            "spare_parts_notes": "",
            "summary": "",
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


def _merge_with_defaults(defaults: Dict[str, Any], saved: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(defaults)
    for key, value in (saved or {}).items():
        default_value = result.get(key)
        if isinstance(default_value, dict) and isinstance(value, dict):
            result[key] = _merge_with_defaults(default_value, value)
        elif _is_blank_value(value) and not _is_blank_value(default_value):
            result[key] = default_value
        else:
            result[key] = value
    return result


def _looks_like_new_profile(data: Dict[str, Any]) -> bool:
    return bool(data) and any(
        key in data for key in ("identity", "specifications", "supervision", "service", "notes")
    )


def _map_legacy_draft_to_profile(equipment: Equipment, saved: Dict[str, Any]) -> Dict[str, Any]:
    general = (saved or {}).get("general") or {}
    technical = (saved or {}).get("technical") or {}
    compliance = (saved or {}).get("compliance") or {}
    maintenance = (saved or {}).get("maintenance") or {}
    notes = (saved or {}).get("notes") or {}

    return {
        "identity": {
            "passport_number": general.get("passport_number") or equipment.passport_number or "",
            "equipment_type": general.get("equipment_type") or equipment.equipment_type or "",
            "registration_number": general.get("registration_number") or equipment.registration_number or "",
            "factory_number": general.get("factory_number") or equipment.factory_number or "",
            "inventory_number": general.get("inventory_number") or equipment.inventory_number or "",
            "manufacturer": general.get("manufacturer") or equipment.manufacturer or "",
            "workshop": general.get("workshop") or equipment.workshop or "",
            "installation_location": general.get("installation_location") or equipment.installation_location or "",
            "status": equipment.status or "active",
            "owner_department": general.get("owner_department") or equipment.workshop or "",
            "responsible_person": general.get("responsible_person") or "",
            "commissioning_date": _format_date_short(equipment.installation_date),
            "commissioning_order": general.get("commissioning_order") or "",
        },
        "specifications": {
            "load_capacity_t": technical.get("load_capacity_t") or _stringify_number(equipment.load_capacity),
            "span_m": technical.get("span_m") or "",
            "lifting_height_m": technical.get("lifting_height_m") or "",
            "duty_group": technical.get("duty_group") or "",
            "control_mode": technical.get("control_mode") or "",
            "power_supply": technical.get("power_supply") or "",
            "climate_version": technical.get("climate_version") or "",
            "factory_year": technical.get("factory_year") or "",
            "drive_type": "",
            "notes": technical.get("notes") or "",
        },
        "supervision": {
            "rostekhnadzor_registered": compliance.get("rostekhnadzor_registered")
            if compliance.get("rostekhnadzor_registered") is not None
            else bool(equipment.rostekhnadzor_registered),
            "registration_date": compliance.get("registration_date") or "",
            "expertise_date": compliance.get("expertise_date") or _format_date_short(equipment.expertise_date),
            "operation_permit_until": compliance.get("operation_permit_until") or _format_date_short(equipment.operation_permit_until),
            "operation_banned": bool(equipment.operation_banned),
            "epb_details": compliance.get("epb_details") or equipment.epb_positive_details or "",
            "restrictions": compliance.get("restrictions") or "",
            "safety_devices": compliance.get("safety_devices") or "",
        },
        "service": {
            "pto_date": _format_date_short(equipment.pto_date),
            "cto_date": _format_date_short(equipment.cto_date),
            "service_interval_days": maintenance.get("service_interval_days") or "",
            "last_major_repair_at": maintenance.get("last_major_repair_at") or "",
            "maintenance_notes": maintenance.get("maintenance_notes") or "",
            "modernization_notes": maintenance.get("modernization_notes") or "",
            "service_contract": "",
        },
        "notes": {
            "operating_notes": notes.get("operating_notes") or "",
            "defect_notes": notes.get("defect_notes") or "",
            "spare_parts_notes": notes.get("spare_parts_notes") or "",
            "summary": general.get("notes") or "",
        },
    }

def _normalize_profile_data(equipment: Equipment, saved: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    defaults = _default_profile_data(equipment)
    if not saved:
        return defaults
    if _looks_like_new_profile(saved):
        return _merge_with_defaults(defaults, saved)
    return _merge_with_defaults(defaults, _map_legacy_draft_to_profile(equipment, saved))


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


def _calculate_completeness(profile: Dict[str, Any], document_count: int, version_count: int) -> float:
    tracked_fields = [
        ("identity", "passport_number"),
        ("identity", "equipment_type"),
        ("identity", "registration_number"),
        ("identity", "factory_number"),
        ("identity", "workshop"),
        ("identity", "installation_location"),
        ("identity", "responsible_person"),
        ("specifications", "load_capacity_t"),
        ("specifications", "duty_group"),
        ("supervision", "expertise_date"),
        ("service", "pto_date"),
        ("service", "cto_date"),
    ]
    total = len(tracked_fields) + 2
    filled = 0
    for section, field in tracked_fields:
        section_data = profile.get(section) or {}
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


def _status_label(value: Optional[str]) -> str:
    mapping = {
        "active": "В эксплуатации",
        "inactive": "Неактивно",
        "archived": "В архиве",
        "draft": "Черновик",
        "review": "На проверке",
        "approved": "Утвержден",
        "open": "Открыто",
        "in_progress": "В работе",
        "pending": "Ожидает",
        "resolved": "Устранено",
        "completed": "Завершено",
        "done": "Завершено",
        "signed": "Подписан",
    }
    if not value:
        return "—"
    return mapping.get(value.lower(), value)


def _severity_label(value: Optional[str]) -> str:
    mapping = {
        "low": "Низкая",
        "medium": "Средняя",
        "high": "Высокая",
        "critical": "Критическая",
    }
    if not value:
        return "—"
    return mapping.get(value.lower(), value)


def _compute_risk_level(violations: List[Violation]) -> str:
    active = [item for item in violations if (item.status or "open") in OPEN_VIOLATION_STATUSES]
    if any(item.is_overdue or (item.severity or "").lower() == "critical" for item in active):
        return "critical"
    high_items = [item for item in active if (item.severity or "medium").lower() in {"high", "critical"}]
    if len(high_items) >= 2 or len(active) >= 5:
        return "high"
    if len(active) >= 2:
        return "medium"
    if len(active) >= 1:
        return "low"
    return "stable"


def _next_control_info(equipment: Equipment) -> Dict[str, Any]:
    dates = [value for value in [equipment.pto_date, equipment.cto_date, equipment.operation_permit_until] if value]
    next_date = min(dates) if dates else None
    if not next_date:
        return {"next_control_date": None, "days_to_next_control": None}
    delta = next_date.date() - datetime.utcnow().date()
    return {
        "next_control_date": next_date.isoformat(),
        "days_to_next_control": delta.days,
    }


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
        "installation_date": equipment.installation_date.isoformat() if equipment.installation_date else None,
        "pto_date": equipment.pto_date.isoformat() if equipment.pto_date else None,
        "cto_date": equipment.cto_date.isoformat() if equipment.cto_date else None,
        "expertise_date": equipment.expertise_date.isoformat() if equipment.expertise_date else None,
        "operation_permit_until": equipment.operation_permit_until.isoformat() if equipment.operation_permit_until else None,
        "operation_banned": equipment.operation_banned,
        "rostekhnadzor_registered": equipment.rostekhnadzor_registered,
        "epb_positive_details": equipment.epb_positive_details,
        "updated_at": equipment.updated_at.isoformat() if equipment.updated_at else None,
    }


def _file_payload(file_model: FileModel) -> Dict[str, Any]:
    return {
        "id": file_model.id,
        "original_filename": file_model.original_filename,
        "description": file_model.description,
        "file_type": file_model.file_type,
        "mime_type": file_model.mime_type,
        "file_size": file_model.file_size,
        "created_at": file_model.created_at.isoformat() if file_model.created_at else None,
        "equipment_id": file_model.equipment_id,
        "inspection_id": file_model.inspection_id,
        "violation_id": file_model.violation_id,
        "act_id": file_model.act_id,
        "task_id": file_model.task_id,
        "download_url": f"/api/files/{file_model.id}",
    }


def _document_payload(document: EquipmentPassportDocument) -> Dict[str, Any]:
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
        "status_label": _status_label(document.status),
        "is_required": document.is_required,
        "notes": document.notes,
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "updated_at": document.updated_at.isoformat() if document.updated_at else None,
        "uploaded_by": document.uploaded_by,
        "file": _file_payload(document.file) if document.file else None,
    }


def _version_payload(version: EquipmentPassportVersion) -> Dict[str, Any]:
    return {
        "id": version.id,
        "version_number": version.version_number,
        "status": version.status,
        "status_label": _status_label(version.status),
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
        "source_label": {"manual": "Вручную", "system": "Система", "ai": "AI"}.get(event.source, event.source),
        "related_entity_type": event.related_entity_type,
        "related_entity_id": event.related_entity_id,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "created_by": event.created_by,
    }

def _violation_payload(violation: Violation, attachments: List[FileModel]) -> Dict[str, Any]:
    return {
        "id": violation.id,
        "description": violation.description,
        "status": violation.status,
        "status_label": _status_label(violation.status),
        "severity": violation.severity,
        "severity_label": _severity_label(violation.severity),
        "criticality_level": violation.criticality_level,
        "violation_type": violation.violation_type,
        "location": violation.location,
        "deadline": violation.deadline.isoformat() if violation.deadline else None,
        "is_overdue": bool(violation.is_overdue),
        "resolved_at": violation.resolved_at.isoformat() if violation.resolved_at else None,
        "created_at": violation.created_at.isoformat() if violation.created_at else None,
        "updated_at": violation.updated_at.isoformat() if violation.updated_at else None,
        "fnp_clause": violation.fnp_clause,
        "gost_clause": violation.gost_clause,
        "norm_reference": violation.norm_reference,
        "defect_node": {
            "id": violation.defect_node.id,
            "title": violation.defect_node.title,
            "key": violation.defect_node.key,
        } if violation.defect_node else None,
        "attachments": [_file_payload(item) for item in attachments],
    }


def _inspection_payload(inspection: Inspection) -> Dict[str, Any]:
    return {
        "id": inspection.id,
        "status": inspection.status,
        "status_label": _status_label(inspection.status),
        "notes": inspection.notes,
        "started_at": inspection.started_at.isoformat() if inspection.started_at else None,
        "completed_at": inspection.completed_at.isoformat() if inspection.completed_at else None,
        "created_at": inspection.created_at.isoformat() if inspection.created_at else None,
        "updated_at": inspection.updated_at.isoformat() if inspection.updated_at else None,
        "checklist_template_id": inspection.checklist_template_id,
        "violations_count": len(inspection.violations or []),
    }


def _task_payload(task: Task, attachments: List[FileModel]) -> Dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "status_label": _status_label(task.status),
        "priority": task.priority,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "violation_id": task.violation_id,
        "attachments": [_file_payload(item) for item in attachments],
    }


def _act_payload(act: Act, attachments: List[FileModel]) -> Dict[str, Any]:
    return {
        "id": act.id,
        "act_number": act.act_number,
        "status": act.status,
        "status_label": _status_label(act.status),
        "act_date": act.act_date.isoformat() if act.act_date else None,
        "created_at": act.created_at.isoformat() if act.created_at else None,
        "attachments": [_file_payload(item) for item in attachments],
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

    profile = _default_profile_data(equipment)
    passport = EquipmentPassport(
        equipment_id=equipment.id,
        passport_status="draft",
        draft_data=profile,
        completeness_percent=_calculate_completeness(profile, 0, 0),
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


async def _collect_related_data(db: AsyncSession, equipment: Equipment) -> Dict[str, Any]:
    violations = (
        await db.execute(
            select(Violation)
            .options(selectinload(Violation.defect_node))
            .where(Violation.equipment_id == equipment.id)
            .order_by(Violation.created_at.desc())
        )
    ).scalars().all()
    inspections = (
        await db.execute(
            select(Inspection)
            .options(selectinload(Inspection.violations))
            .where(Inspection.equipment_id == equipment.id)
            .order_by(Inspection.created_at.desc())
        )
    ).scalars().all()
    acts = (
        await db.execute(select(Act).where(Act.equipment_id == equipment.id).order_by(Act.created_at.desc()))
    ).scalars().all()
    tasks = (
        await db.execute(select(Task).where(Task.equipment_id == equipment.id).order_by(Task.created_at.desc()))
    ).scalars().all()

    violation_ids = [item.id for item in violations]
    act_ids = [item.id for item in acts]
    task_ids = [item.id for item in tasks]

    conditions = [FileModel.equipment_id == equipment.id]
    if violation_ids:
        conditions.append(FileModel.violation_id.in_(violation_ids))
    if act_ids:
        conditions.append(FileModel.act_id.in_(act_ids))
    if task_ids:
        conditions.append(FileModel.task_id.in_(task_ids))

    raw_files = (
        await db.execute(select(FileModel).where(or_(*conditions)).order_by(FileModel.created_at.desc()))
    ).scalars().all()
    files = list({item.id: item for item in raw_files}.values())

    files_by_violation: Dict[int, List[FileModel]] = {}
    files_by_act: Dict[int, List[FileModel]] = {}
    files_by_task: Dict[int, List[FileModel]] = {}
    equipment_files: List[FileModel] = []

    for file_model in files:
        if file_model.violation_id:
            files_by_violation.setdefault(file_model.violation_id, []).append(file_model)
        if file_model.act_id:
            files_by_act.setdefault(file_model.act_id, []).append(file_model)
        if file_model.task_id:
            files_by_task.setdefault(file_model.task_id, []).append(file_model)
        if file_model.equipment_id == equipment.id and not file_model.violation_id and not file_model.act_id and not file_model.task_id:
            equipment_files.append(file_model)

    return {
        "violations": [_violation_payload(item, files_by_violation.get(item.id, [])) for item in violations],
        "inspections": [_inspection_payload(item) for item in inspections],
        "tasks": [_task_payload(item, files_by_task.get(item.id, [])) for item in tasks],
        "acts": [_act_payload(item, files_by_act.get(item.id, [])) for item in acts],
        "files": [_file_payload(item) for item in equipment_files],
        "raw_violations": violations,
        "raw_inspections": inspections,
        "raw_tasks": tasks,
        "raw_acts": acts,
        "raw_files": files,
    }

def _build_readiness(profile: Dict[str, Any], documents: List[EquipmentPassportDocument], related: Dict[str, Any]) -> Dict[str, Any]:
    identity = profile.get("identity") or {}
    supervision = profile.get("supervision") or {}
    service = profile.get("service") or {}
    missing_fields: List[str] = []
    tracked = [
        (identity.get("registration_number"), "Регистрационный номер"),
        (identity.get("factory_number"), "Заводской номер"),
        (identity.get("workshop"), "Цех"),
        (identity.get("installation_location"), "Место установки"),
        (identity.get("responsible_person"), "Ответственный"),
        (service.get("pto_date"), "Дата ПТО"),
        (service.get("cto_date"), "Дата ЧТО"),
        (supervision.get("expertise_date"), "Дата экспертизы"),
    ]
    for value, label in tracked:
        if value in (None, "", [], {}):
            missing_fields.append(label)

    return {
        "identity_ready": len([field for field in [identity.get("passport_number"), identity.get("equipment_type"), identity.get("workshop")] if field]) >= 3,
        "supervision_ready": bool(supervision.get("expertise_date") or supervision.get("operation_permit_until")),
        "documents_ready": len(documents) > 0,
        "history_ready": bool(related["raw_inspections"] or related["raw_acts"] or related["raw_tasks"] or related["raw_violations"]),
        "missing_fields": missing_fields,
    }


def _build_dashboard(equipment: Equipment, profile: Dict[str, Any], documents: List[EquipmentPassportDocument], versions: List[EquipmentPassportVersion], related: Dict[str, Any]) -> Dict[str, Any]:
    violations = related["raw_violations"]
    tasks = related["raw_tasks"]
    inspections = related["raw_inspections"]
    acts = related["raw_acts"]
    files = related["raw_files"]

    open_violations = [item for item in violations if (item.status or "open") in OPEN_VIOLATION_STATUSES]
    overdue_violations = [item for item in open_violations if item.is_overdue or (item.deadline and item.deadline < datetime.utcnow())]
    open_tasks = [item for item in tasks if (item.status or "open").lower() not in CLOSED_TASK_STATUSES]
    next_control = _next_control_info(equipment)

    last_candidates = [equipment.updated_at]
    last_candidates.extend(item.created_at for item in violations if item.created_at)
    last_candidates.extend(item.created_at for item in tasks if item.created_at)
    last_candidates.extend(item.created_at for item in acts if item.created_at)
    last_candidates.extend(item.created_at for item in inspections if item.created_at)
    last_candidates.extend(item.created_at for item in files if item.created_at)
    last_event_at = max(last_candidates) if last_candidates else None

    return {
        "risk_level": _compute_risk_level(violations),
        "violations_total": len(violations),
        "violations_open": len(open_violations),
        "violations_overdue": len(overdue_violations),
        "inspections_total": len(inspections),
        "acts_total": len(acts),
        "tasks_total": len(tasks),
        "tasks_open": len(open_tasks),
        "passport_documents_total": len(documents),
        "related_files_total": len(related["files"]),
        "versions_total": len(versions),
        "last_event_at": last_event_at.isoformat() if last_event_at else None,
        "last_inspection_at": inspections[0].created_at.isoformat() if inspections else None,
        "last_violation_at": violations[0].created_at.isoformat() if violations else None,
        "last_act_at": acts[0].created_at.isoformat() if acts else None,
        "last_file_at": files[0].created_at.isoformat() if files else None,
        **next_control,
        "readiness": _build_readiness(profile, documents, related),
    }


def _build_timeline(documents: List[EquipmentPassportDocument], events: List[EquipmentPassportEvent], related: Dict[str, Any]) -> List[Dict[str, Any]]:
    timeline: List[Dict[str, Any]] = []
    for event in events:
        timeline.append({
            "kind": "passport_event",
            "title": event.title,
            "subtitle": event.event_type,
            "date": event.event_date.isoformat() if event.event_date else None,
            "status": event.source,
        })
    for item in documents:
        timeline.append({
            "kind": "document",
            "title": item.title,
            "subtitle": f"Документ: {item.document_type}",
            "date": item.created_at.isoformat() if item.created_at else None,
            "status": item.status,
        })
    for item in related["raw_violations"]:
        timeline.append({
            "kind": "violation",
            "title": (item.description or "Нарушение")[:140],
            "subtitle": f"Нарушение • {_severity_label(item.severity)}",
            "date": item.created_at.isoformat() if item.created_at else None,
            "status": item.status,
        })
    for item in related["raw_inspections"]:
        timeline.append({
            "kind": "inspection",
            "title": "Осмотр оборудования",
            "subtitle": f"Статус: {_status_label(item.status)}",
            "date": item.created_at.isoformat() if item.created_at else None,
            "status": item.status,
        })
    for item in related["raw_acts"]:
        timeline.append({
            "kind": "act",
            "title": f"Акт {item.act_number or 'без номера'}",
            "subtitle": f"Статус: {_status_label(item.status)}",
            "date": item.created_at.isoformat() if item.created_at else None,
            "status": item.status,
        })
    for item in related["raw_tasks"]:
        timeline.append({
            "kind": "task",
            "title": item.title,
            "subtitle": f"Задача • {_status_label(item.status)}",
            "date": item.created_at.isoformat() if item.created_at else None,
            "status": item.status,
        })
    timeline.sort(key=lambda row: row.get("date") or "", reverse=True)
    return timeline[:25]


async def _build_snapshot(
    equipment: Equipment,
    passport: EquipmentPassport,
    profile: Dict[str, Any],
    documents: List[EquipmentPassportDocument],
    versions: List[EquipmentPassportVersion],
    events: List[EquipmentPassportEvent],
    related: Dict[str, Any],
    completeness_percent: float,
) -> Dict[str, Any]:
    return {
        "captured_at": datetime.utcnow().isoformat(),
        "equipment": _equipment_payload(equipment),
        "passport": {
            "passport_id": passport.id,
            "passport_status": passport.passport_status,
            "completeness_percent": completeness_percent,
            "profile": profile,
        },
        "documents": [_document_payload(item) for item in documents],
        "events": [_event_payload(item) for item in events],
        "dashboard": _build_dashboard(equipment, profile, documents, versions, related),
    }


async def _build_passport_response(db: AsyncSession, equipment: Equipment) -> Dict[str, Any]:
    passport = await _get_or_create_passport(db, equipment)
    profile = _normalize_profile_data(equipment, passport.draft_data or {})
    documents, versions, events = await _load_passport_related(db, passport.id)
    completeness_percent = _calculate_completeness(profile, len(documents), len(versions))
    passport.draft_data = profile
    passport.completeness_percent = completeness_percent
    related = await _collect_related_data(db, equipment)
    current_version = next((item for item in versions if item.id == passport.current_version_id), None)
    dashboard = _build_dashboard(equipment, profile, documents, versions, related)
    timeline = _build_timeline(documents, events, related)

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
        "profile": profile,
        "draft_data": profile,
        "dashboard": dashboard,
        "documents": [_document_payload(item) for item in documents],
        "events": [_event_payload(item) for item in events],
        "versions": [_version_payload(item) for item in versions],
        "related": {
            "violations": related["violations"],
            "inspections": related["inspections"],
            "tasks": related["tasks"],
            "acts": related["acts"],
            "files": related["files"],
        },
        "timeline": timeline,
    }


class PassportIndexItem(BaseModel):
    equipment_id: int
    passport_id: Optional[int] = None
    equipment_type: str
    passport_number: str
    registration_number: Optional[str] = None
    factory_number: Optional[str] = None
    inventory_number: Optional[str] = None
    workshop: Optional[str] = None
    equipment_status: str
    passport_status: str
    completeness_percent: float
    open_violations: int
    overdue_violations: int
    next_control_date: Optional[str] = None
    last_published_at: Optional[str] = None
    risk_level: str


class PassportProfileUpdateRequest(BaseModel):
    profile: Optional[Dict[str, Any]] = None
    draft_data: Optional[Dict[str, Any]] = None
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

@router.get("/index", response_model=List[PassportIndexItem])
async def get_passports_index(
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "equipment:read", db)

    query = select(Equipment).options(selectinload(Equipment.passport).selectinload(EquipmentPassport.documents), selectinload(Equipment.passport).selectinload(EquipmentPassport.versions)).order_by(Equipment.passport_number.asc())
    if search:
        like = f"%{search.strip()}%"
        query = query.where(
            or_(
                Equipment.passport_number.ilike(like),
                Equipment.registration_number.ilike(like),
                Equipment.factory_number.ilike(like),
                Equipment.inventory_number.ilike(like),
                Equipment.equipment_type.ilike(like),
                Equipment.workshop.ilike(like),
                Equipment.installation_location.ilike(like),
            )
        )
    query = query.limit(limit)
    equipment_items = (await db.execute(query)).scalars().all()

    equipment_ids = [item.id for item in equipment_items]
    grouped: Dict[int, List[Dict[str, Any]]] = {}
    if equipment_ids:
        violation_result = await db.execute(
            select(Violation.equipment_id, Violation.status, Violation.is_overdue, Violation.severity).where(
                Violation.equipment_id.in_(equipment_ids)
            )
        )
        for equipment_id, status_value, is_overdue, severity in violation_result.all():
            grouped.setdefault(equipment_id, []).append({
                "status": status_value,
                "is_overdue": is_overdue,
                "severity": severity,
            })

    items: List[PassportIndexItem] = []
    for equipment in equipment_items:
        passport = equipment.passport
        profile = _normalize_profile_data(equipment, passport.draft_data if passport else None)
        documents_count = len(passport.documents or []) if passport else 0
        versions_count = len(passport.versions or []) if passport else 0
        completeness = passport.completeness_percent if passport and passport.completeness_percent else _calculate_completeness(profile, documents_count, versions_count)
        violations = grouped.get(equipment.id, [])
        open_count = len([item for item in violations if (item.get("status") or "open") in OPEN_VIOLATION_STATUSES])
        overdue_count = len([item for item in violations if item.get("is_overdue")])
        risk_level = "stable"
        if any(item.get("is_overdue") or (item.get("severity") or "").lower() == "critical" for item in violations):
            risk_level = "critical"
        elif open_count >= 5:
            risk_level = "high"
        elif open_count >= 2:
            risk_level = "medium"
        elif open_count >= 1:
            risk_level = "low"

        next_control = _next_control_info(equipment)
        items.append(
            PassportIndexItem(
                equipment_id=equipment.id,
                passport_id=passport.id if passport else None,
                equipment_type=equipment.equipment_type,
                passport_number=equipment.passport_number,
                registration_number=equipment.registration_number,
                factory_number=equipment.factory_number,
                inventory_number=equipment.inventory_number,
                workshop=equipment.workshop,
                equipment_status=equipment.status,
                passport_status=passport.passport_status if passport else "draft",
                completeness_percent=completeness,
                open_violations=open_count,
                overdue_violations=overdue_count,
                next_control_date=next_control["next_control_date"],
                last_published_at=passport.last_published_at.isoformat() if passport and passport.last_published_at else None,
                risk_level=risk_level,
            )
        )
    return items


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


async def _save_passport_profile(
    equipment_id: int,
    request_body: PassportProfileUpdateRequest,
    request: Request,
    current_user: User,
    db: AsyncSession,
):
    await require_permission(current_user, "equipment:update", db)
    equipment = await _get_equipment_or_404(db, equipment_id)
    passport = await _get_or_create_passport(db, equipment, current_user.id)

    before_profile = _normalize_profile_data(equipment, passport.draft_data or {})
    before_status = passport.passport_status
    incoming_profile = request_body.profile if request_body.profile is not None else (request_body.draft_data or {})
    merged = _deep_merge_dicts(before_profile, incoming_profile)
    normalized = _normalize_profile_data(equipment, merged)

    passport.draft_data = normalized
    passport.passport_status = _normalize_passport_status(request_body.passport_status, "draft")
    passport.updated_by = current_user.id
    passport.updated_at = datetime.utcnow()
    documents, versions, _ = await _load_passport_related(db, passport.id)
    passport.completeness_percent = _calculate_completeness(normalized, len(documents), len(versions))

    db.add(_activity(current_user.id, "update", f"Обновлен профиль паспорта оборудования #{equipment.id}", passport.id))
    await log_audit_event(
        db,
        entity_type="equipment_passport",
        entity_id=passport.id,
        action="UPDATE_PROFILE",
        performed_by=current_user.id,
        source="ui",
        trace_id=getattr(request.state, "trace_id", None),
        field_changes=build_field_changes(
            {"profile": before_profile, "passport_status": before_status},
            {"profile": normalized, "passport_status": passport.passport_status},
        ),
    )

    await db.commit()
    refreshed_equipment = await _get_equipment_or_404(db, equipment_id)
    return await _build_passport_response(db, refreshed_equipment)


@router.put("/equipment/{equipment_id}/profile")
async def update_equipment_passport_profile(
    equipment_id: int,
    request_body: PassportProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _save_passport_profile(equipment_id, request_body, request, current_user, db)


@router.put("/equipment/{equipment_id}/draft")
async def update_equipment_passport_draft(
    equipment_id: int,
    request_body: PassportProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _save_passport_profile(equipment_id, request_body, request, current_user, db)


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
    profile = _normalize_profile_data(equipment, passport.draft_data or {})
    completeness_percent = _calculate_completeness(profile, len(documents), len(versions))
    related = await _collect_related_data(db, equipment)

    next_version_number = (versions[0].version_number + 1) if versions else 1
    snapshot = await _build_snapshot(equipment, passport, profile, documents, versions, events, related, completeness_percent)

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
    passport.draft_data = profile
    passport.completeness_percent = _calculate_completeness(profile, len(documents), len(versions) + 1)

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

    profile = _normalize_profile_data(equipment, passport.draft_data or {})
    documents, versions, _ = await _load_passport_related(db, passport.id)
    passport.completeness_percent = _calculate_completeness(profile, len(documents), len(versions))
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
    equipment_id = document.passport.equipment_id

    before = _document_payload(document)
    data = request_body.dict(exclude_unset=True)
    if "status" in data:
        data["status"] = _normalize_document_status(data["status"])
    for field, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(document, field, value)
    document.updated_at = datetime.utcnow()

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
    equipment_id = event.equipment_id

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
    refreshed_equipment = await _get_equipment_or_404(db, equipment_id)
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


