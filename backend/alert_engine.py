import logging
from datetime import datetime, timedelta
from typing import Dict, Set, Tuple

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.models import Alert, Violation
except ImportError:
    from .models import Alert, Violation

logger = logging.getLogger(__name__)

ALERT_TYPE_OVERDUE = "SLA_OVERDUE"
ALERT_TYPE_WARNING = "SLA_WARNING"


async def run_sla_alert_cycle(db: AsyncSession) -> Dict[str, int]:
    """
    Синхронизирует alerts по нарушениям:
    - SLA_OVERDUE: deadline < now, status=open
    - SLA_WARNING: now <= deadline <= now+24h, status=open
    Устаревшие записи удаляются.
    """
    now = datetime.utcnow()
    warning_until = now + timedelta(hours=24)

    violations_result = await db.execute(
        select(Violation.id, Violation.deadline, Violation.status).where(
            and_(
                Violation.status == "open",
                Violation.deadline.isnot(None),
            )
        )
    )
    violations = violations_result.all()

    target_alerts: Set[Tuple[str, int, str]] = set()
    for violation_id, deadline, _status in violations:
        if deadline is None:
            continue
        if deadline < now:
            target_alerts.add(("violation", int(violation_id), ALERT_TYPE_OVERDUE))
        elif deadline <= warning_until:
            target_alerts.add(("violation", int(violation_id), ALERT_TYPE_WARNING))

    existing_result = await db.execute(
        select(Alert).where(Alert.entity_type == "violation")
    )
    existing_alerts = existing_result.scalars().all()
    existing_map: Dict[Tuple[str, int, str], Alert] = {
        (item.entity_type, int(item.entity_id), item.type): item for item in existing_alerts
    }

    created = 0
    removed = 0

    for key in target_alerts:
        if key not in existing_map:
            db.add(
                Alert(
                    entity_type=key[0],
                    entity_id=key[1],
                    type=key[2],
                )
            )
            created += 1

    for key, alert in existing_map.items():
        if key not in target_alerts:
            await db.delete(alert)
            removed += 1

    await db.commit()
    logger.info(
        "SLA alert cycle complete: targets=%s created=%s removed=%s",
        len(target_alerts),
        created,
        removed,
    )
    return {
        "targets": len(target_alerts),
        "created": created,
        "removed": removed,
    }
