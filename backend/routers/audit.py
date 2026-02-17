from datetime import datetime, timedelta
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Поддержка запуска как скрипта и как модуля
try:
    from backend.auth import get_current_user, require_permission
    from backend.database import get_db
    from backend.models import AuditLog, ErrorEvent, User, UserActivity
except ImportError:
    from ..auth import get_current_user, require_permission
    from ..database import get_db
    from ..models import AuditLog, ErrorEvent, User, UserActivity

router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    username: str
    action_type: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    description: Optional[str]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AuditEventResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    field_changes: Optional[dict] = None
    performed_by: Optional[int] = None
    performed_at: datetime
    source: str
    trace_id: Optional[str] = None


class ErrorEventResponse(BaseModel):
    id: int
    code: str
    message: str
    trace_id: str
    path: Optional[str] = None
    method: Optional[str] = None
    status_code: int
    retryable: bool
    details: Optional[Any] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[int] = None
    resolved_by_username: Optional[str] = None

    class Config:
        from_attributes = True


class ErrorCodeCountResponse(BaseModel):
    code: str
    count: int


class ErrorSummaryResponse(BaseModel):
    total: int
    unresolved: int
    resolved: int
    retryable: int
    last_24h: int
    top_codes: List[ErrorCodeCountResponse]


@router.get("", response_model=List[AuditLogResponse])
async def get_audit_log(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user_id: Optional[int] = None,
    action_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Получить лог аудита"""
    await require_permission(current_user, "audit:read", db)

    query = select(UserActivity).join(User, UserActivity.user_id == User.id)

    if user_id:
        query = query.where(UserActivity.user_id == user_id)

    if action_type:
        query = query.where(UserActivity.action_type == action_type)

    if entity_type:
        query = query.where(UserActivity.entity_type == entity_type)

    query = query.order_by(UserActivity.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    activities = result.scalars().all()

    user_ids = list({a.user_id for a in activities})
    users_result = await db.execute(select(User).where(User.id.in_(user_ids))) if user_ids else None
    users = {u.id: u.username for u in users_result.scalars().all()} if users_result else {}

    return [
        AuditLogResponse(
            id=a.id,
            user_id=a.user_id,
            username=users.get(a.user_id, "Unknown"),
            action_type=a.action_type,
            entity_type=a.entity_type,
            entity_id=a.entity_id,
            description=a.description,
            ip_address=a.ip_address,
            created_at=a.created_at,
        )
        for a in activities
    ]


@router.get("/events", response_model=List[AuditEventResponse])
async def get_audit_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "audit:read", db)

    query = select(AuditLog)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(AuditLog.entity_id == str(entity_id))

    query = query.order_by(AuditLog.performed_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    rows = result.scalars().all()

    return [
        AuditEventResponse(
            id=row.id,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            action=row.action,
            field_changes=row.field_changes,
            performed_by=row.performed_by,
            performed_at=row.performed_at,
            source=row.source,
            trace_id=row.trace_id,
        )
        for row in rows
    ]


@router.get("/errors", response_model=List[ErrorEventResponse])
async def get_error_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    code: Optional[str] = None,
    status_code: Optional[int] = Query(None, ge=100, le=599),
    retryable: Optional[bool] = None,
    unresolved_only: bool = False,
    trace_id: Optional[str] = None,
    path: Optional[str] = None,
    method: Optional[str] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "audit:read", db)

    query = (
        select(ErrorEvent, User.username.label("resolved_by_username"))
        .outerjoin(User, User.id == ErrorEvent.resolved_by)
    )

    filters = []
    if code:
        filters.append(ErrorEvent.code == code)
    if status_code is not None:
        filters.append(ErrorEvent.status_code == status_code)
    if retryable is not None:
        filters.append(ErrorEvent.retryable == retryable)
    if unresolved_only:
        filters.append(ErrorEvent.resolved_at.is_(None))
    if trace_id:
        filters.append(ErrorEvent.trace_id == trace_id)
    if path:
        filters.append(ErrorEvent.path.ilike(f"%{path}%"))
    if method:
        filters.append(ErrorEvent.method == method.upper())
    if created_from:
        filters.append(ErrorEvent.created_at >= created_from)
    if created_to:
        filters.append(ErrorEvent.created_at <= created_to)

    if filters:
        query = query.where(and_(*filters))

    query = query.order_by(ErrorEvent.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(query)).all()

    return [
        ErrorEventResponse(
            id=row.ErrorEvent.id,
            code=row.ErrorEvent.code,
            message=row.ErrorEvent.message,
            trace_id=row.ErrorEvent.trace_id,
            path=row.ErrorEvent.path,
            method=row.ErrorEvent.method,
            status_code=row.ErrorEvent.status_code,
            retryable=row.ErrorEvent.retryable,
            details=row.ErrorEvent.details,
            created_at=row.ErrorEvent.created_at,
            resolved_at=row.ErrorEvent.resolved_at,
            resolved_by=row.ErrorEvent.resolved_by,
            resolved_by_username=row.resolved_by_username,
        )
        for row in rows
    ]


@router.get("/errors/summary", response_model=ErrorSummaryResponse)
async def get_error_events_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "audit:read", db)

    since_24h = datetime.utcnow() - timedelta(hours=24)

    total = (await db.execute(select(func.count()).select_from(ErrorEvent))).scalar() or 0
    unresolved = (
        await db.execute(
            select(func.count()).select_from(ErrorEvent).where(ErrorEvent.resolved_at.is_(None))
        )
    ).scalar() or 0
    resolved = (
        await db.execute(
            select(func.count()).select_from(ErrorEvent).where(ErrorEvent.resolved_at.is_not(None))
        )
    ).scalar() or 0
    retryable_count = (
        await db.execute(
            select(func.count()).select_from(ErrorEvent).where(ErrorEvent.retryable.is_(True))
        )
    ).scalar() or 0
    last_24h = (
        await db.execute(
            select(func.count()).select_from(ErrorEvent).where(ErrorEvent.created_at >= since_24h)
        )
    ).scalar() or 0

    top_codes_rows = (
        await db.execute(
            select(ErrorEvent.code, func.count().label("count"))
            .group_by(ErrorEvent.code)
            .order_by(func.count().desc())
            .limit(5)
        )
    ).all()

    return ErrorSummaryResponse(
        total=int(total),
        unresolved=int(unresolved),
        resolved=int(resolved),
        retryable=int(retryable_count),
        last_24h=int(last_24h),
        top_codes=[
            ErrorCodeCountResponse(code=row.code, count=int(row.count))
            for row in top_codes_rows
        ],
    )


@router.post("/errors/{error_id}/resolve", response_model=ErrorEventResponse)
async def resolve_error_event(
    error_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "audit:read", db)

    event = (
        await db.execute(select(ErrorEvent).where(ErrorEvent.id == error_id))
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Error event not found")

    if event.resolved_at is None:
        event.resolved_at = datetime.utcnow()
        event.resolved_by = current_user.id
        await db.commit()
        await db.refresh(event)

    resolver = None
    if event.resolved_by:
        resolver = (
            await db.execute(select(User.username).where(User.id == event.resolved_by))
        ).scalar_one_or_none()

    return ErrorEventResponse(
        id=event.id,
        code=event.code,
        message=event.message,
        trace_id=event.trace_id,
        path=event.path,
        method=event.method,
        status_code=event.status_code,
        retryable=event.retryable,
        details=event.details,
        created_at=event.created_at,
        resolved_at=event.resolved_at,
        resolved_by=event.resolved_by,
        resolved_by_username=resolver,
    )
