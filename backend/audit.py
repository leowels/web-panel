from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Iterable, Optional
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

try:
    from .models import AuditLog
except ImportError:
    from models import AuditLog


def build_field_changes(
    before: Dict[str, Any],
    after: Dict[str, Any],
    tracked_fields: Optional[Iterable[str]] = None,
) -> Dict[str, Dict[str, Any]]:
    fields = list(tracked_fields) if tracked_fields else sorted(set(before.keys()) | set(after.keys()))
    changes: Dict[str, Dict[str, Any]] = {}
    for field in fields:
        old_value = before.get(field)
        new_value = after.get(field)
        if old_value != new_value:
            changes[field] = {"old": old_value, "new": new_value}
    return changes


async def log_audit_event(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: Any,
    action: str,
    performed_by: Optional[int],
    source: str = "ui",
    trace_id: Optional[str] = None,
    field_changes: Optional[Dict[str, Any]] = None,
) -> None:
    event = AuditLog(
        id=str(uuid4()),
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        field_changes=field_changes or {},
        performed_by=performed_by,
        performed_at=datetime.utcnow(),
        source=source,
        trace_id=trace_id,
    )
    db.add(event)
