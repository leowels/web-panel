from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.alert_engine import ALERT_TYPE_OVERDUE, ALERT_TYPE_WARNING, run_sla_alert_cycle
    from backend.auth import get_current_user, require_permission
    from backend.database import get_db
    from backend.models import Alert, Equipment, User, Violation
except ImportError:
    from ..alert_engine import ALERT_TYPE_OVERDUE, ALERT_TYPE_WARNING, run_sla_alert_cycle
    from ..auth import get_current_user, require_permission
    from ..database import get_db
    from ..models import Alert, Equipment, User, Violation

from pydantic import BaseModel

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class AlertItemResponse(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    type: str
    created_at: datetime
    acknowledged_at: Optional[datetime] = None
    violation_id: Optional[int] = None
    violation_deadline: Optional[datetime] = None
    equipment_id: Optional[int] = None
    equipment_passport: Optional[str] = None
    equipment_type: Optional[str] = None

    class Config:
        from_attributes = True


class AlertsSummaryResponse(BaseModel):
    total: int
    overdue: int
    warning: int
    unacknowledged: int


@router.get("", response_model=List[AlertItemResponse])
async def get_alerts(
    type: Optional[str] = Query(None, regex="^(SLA_OVERDUE|SLA_WARNING)$"),
    only_unacknowledged: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "violations:read", db)

    query = (
        select(
            Alert,
            Violation.id.label("violation_id"),
            Violation.deadline.label("violation_deadline"),
            Equipment.id.label("equipment_id"),
            Equipment.passport_number.label("equipment_passport"),
            Equipment.equipment_type.label("equipment_type"),
        )
        .outerjoin(
            Violation,
            and_(Alert.entity_type == "violation", Alert.entity_id == Violation.id),
        )
        .outerjoin(Equipment, Violation.equipment_id == Equipment.id)
        .order_by(Alert.created_at.desc())
        .limit(limit)
    )

    if type:
        query = query.where(Alert.type == type)
    if only_unacknowledged:
        query = query.where(Alert.acknowledged_at.is_(None))

    rows = (await db.execute(query)).all()
    return [
        AlertItemResponse(
            id=row.Alert.id,
            entity_type=row.Alert.entity_type,
            entity_id=row.Alert.entity_id,
            type=row.Alert.type,
            created_at=row.Alert.created_at,
            acknowledged_at=row.Alert.acknowledged_at,
            violation_id=row.violation_id,
            violation_deadline=row.violation_deadline,
            equipment_id=row.equipment_id,
            equipment_passport=row.equipment_passport,
            equipment_type=row.equipment_type,
        )
        for row in rows
    ]


@router.get("/summary", response_model=AlertsSummaryResponse)
async def get_alerts_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "violations:read", db)

    total = (await db.execute(select(func.count()).select_from(Alert))).scalar() or 0
    overdue = (
        await db.execute(
            select(func.count()).select_from(Alert).where(Alert.type == ALERT_TYPE_OVERDUE)
        )
    ).scalar() or 0
    warning = (
        await db.execute(
            select(func.count()).select_from(Alert).where(Alert.type == ALERT_TYPE_WARNING)
        )
    ).scalar() or 0
    unacknowledged = (
        await db.execute(
            select(func.count()).select_from(Alert).where(Alert.acknowledged_at.is_(None))
        )
    ).scalar() or 0

    return AlertsSummaryResponse(
        total=int(total),
        overdue=int(overdue),
        warning=int(warning),
        unacknowledged=int(unacknowledged),
    )


@router.post("/{alert_id}/ack", response_model=AlertItemResponse)
async def acknowledge_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "violations:read", db)

    alert = (
        await db.execute(select(Alert).where(Alert.id == alert_id))
    ).scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.acknowledged_at = datetime.utcnow()
    await db.commit()
    await db.refresh(alert)

    return AlertItemResponse(
        id=alert.id,
        entity_type=alert.entity_type,
        entity_id=alert.entity_id,
        type=alert.type,
        created_at=alert.created_at,
        acknowledged_at=alert.acknowledged_at,
    )


@router.post("/ack-all")
async def acknowledge_all_alerts(
    type: Optional[str] = Query(None, regex="^(SLA_OVERDUE|SLA_WARNING)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "violations:read", db)

    query = select(Alert).where(Alert.acknowledged_at.is_(None))
    if type:
        query = query.where(Alert.type == type)
    alerts = (await db.execute(query)).scalars().all()

    now = datetime.utcnow()
    for alert in alerts:
        alert.acknowledged_at = now

    await db.commit()
    return {"acknowledged": len(alerts)}


@router.post("/run")
async def run_alerts_now(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "settings:update", db)
    return await run_sla_alert_cycle(db)
