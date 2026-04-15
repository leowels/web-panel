from datetime import datetime
from typing import Any, Dict, Optional


def _parse_date(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            try:
                return datetime.strptime(raw, "%Y-%m-%d")
            except ValueError:
                return None
    return None


def _format_date(value: Optional[datetime]) -> str:
    if not value:
        return ""
    return value.strftime("%Y-%m-%d")


def merge_equipment_into_passport_draft(equipment: Any, draft_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    draft = dict(draft_data or {})
    general = dict(draft.get("general") or {})
    technical = dict(draft.get("technical") or {})
    compliance = dict(draft.get("compliance") or {})

    general["passport_number"] = equipment.passport_number or ""
    general["equipment_type"] = equipment.equipment_type or ""
    general["registration_number"] = equipment.registration_number or ""
    general["factory_number"] = equipment.factory_number or ""
    general["inventory_number"] = equipment.inventory_number or ""
    general["workshop"] = equipment.workshop or ""
    general["installation_location"] = equipment.installation_location or ""
    general["manufacturer"] = equipment.manufacturer or ""
    general["owner_department"] = equipment.workshop or ""

    technical["load_capacity_t"] = str(equipment.load_capacity) if equipment.load_capacity is not None else ""

    compliance["rostekhnadzor_registered"] = bool(equipment.rostekhnadzor_registered)
    compliance["expertise_date"] = _format_date(equipment.expertise_date)
    compliance["operation_permit_until"] = _format_date(equipment.operation_permit_until)
    compliance["epb_details"] = equipment.epb_positive_details or ""

    draft["general"] = general
    draft["technical"] = technical
    draft["compliance"] = compliance
    return draft


def apply_passport_draft_to_equipment(equipment: Any, draft_data: Optional[Dict[str, Any]]) -> None:
    draft = draft_data or {}
    general = draft.get("general") or {}
    technical = draft.get("technical") or {}
    compliance = draft.get("compliance") or {}

    def _text(value: Any) -> Optional[str]:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    equipment.passport_number = _text(general.get("passport_number")) or equipment.passport_number
    equipment.equipment_type = _text(general.get("equipment_type")) or equipment.equipment_type
    equipment.registration_number = _text(general.get("registration_number"))
    equipment.factory_number = _text(general.get("factory_number"))
    equipment.inventory_number = _text(general.get("inventory_number"))
    equipment.workshop = _text(general.get("workshop"))
    equipment.installation_location = _text(general.get("installation_location"))
    equipment.manufacturer = _text(general.get("manufacturer"))

    raw_capacity = technical.get("load_capacity_t")
    if raw_capacity in (None, ""):
        equipment.load_capacity = None
    else:
        try:
            equipment.load_capacity = float(raw_capacity)
        except (TypeError, ValueError):
            pass

    if "rostekhnadzor_registered" in compliance:
        equipment.rostekhnadzor_registered = bool(compliance.get("rostekhnadzor_registered"))
    if "expertise_date" in compliance:
        equipment.expertise_date = _parse_date(compliance.get("expertise_date"))
    if "operation_permit_until" in compliance:
        equipment.operation_permit_until = _parse_date(compliance.get("operation_permit_until"))
    if "epb_details" in compliance:
        equipment.epb_positive_details = _text(compliance.get("epb_details"))
