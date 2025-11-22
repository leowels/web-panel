from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission

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

@router.get("", response_model=List[AuditLogResponse])
async def get_audit_log(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user_id: Optional[int] = None,
    action_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
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
    
    # Получение имен пользователей
    user_ids = list(set([a.user_id for a in activities]))
    users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {u.id: u.username for u in users_result.scalars().all()}
    
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

