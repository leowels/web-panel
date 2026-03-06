from datetime import datetime
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.auth import get_current_user, require_permission
    from backend.database import get_db
    from backend.models import DefectNode, User, UserActivity, Violation
except ImportError:
    from ..auth import get_current_user, require_permission
    from ..database import get_db
    from ..models import DefectNode, User, UserActivity, Violation

router = APIRouter(prefix="/api/defect-nodes", tags=["defect-nodes"])

ALLOWED_SEVERITIES = {"low", "medium", "high", "critical"}
KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,119}$")


def _ensure_admin(current_user: User) -> None:
    role_names = {ur.role.name for ur in (current_user.roles or []) if getattr(ur, "role", None)}
    if "admin" not in role_names:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


def _normalize_key(raw_key: Optional[str], title: str) -> str:
    source = (raw_key or title or "").strip().lower()
    source = source.replace(" ", "_")
    source = re.sub(r"[^a-z0-9_-]+", "", source)
    source = re.sub(r"_+", "_", source).strip("_-")
    if not source:
        source = f"node_{int(datetime.utcnow().timestamp())}"
    if not KEY_PATTERN.match(source):
        source = re.sub(r"[^a-z0-9_-]+", "", source)
        source = source[:120].strip("_-")
    if not source:
        source = f"node_{int(datetime.utcnow().timestamp())}"
    return source


def _validate_severity(severity: str) -> str:
    normalized = (severity or "").strip().lower()
    if normalized not in ALLOWED_SEVERITIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"severity must be one of: {', '.join(sorted(ALLOWED_SEVERITIES))}",
        )
    return normalized


def _activity(user_id: int, action: str, description: str) -> UserActivity:
    return UserActivity(
        user_id=user_id,
        action_type=action,
        entity_type="defect_node",
        description=description,
    )


class DefectNodeCreate(BaseModel):
    key: Optional[str] = Field(default=None, max_length=120)
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    recommendation: Optional[str] = None
    severity: str = "medium"
    position: str = Field(..., min_length=1, max_length=255)
    normal: Optional[str] = Field(default="0m 1m 0m", max_length=255)
    hotspot_size: Optional[float] = None
    sort_order: int = 100
    is_active: bool = True


class DefectNodeUpdate(BaseModel):
    key: Optional[str] = Field(default=None, max_length=120)
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    recommendation: Optional[str] = None
    severity: Optional[str] = None
    position: Optional[str] = Field(default=None, min_length=1, max_length=255)
    normal: Optional[str] = Field(default=None, max_length=255)
    hotspot_size: Optional[float] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class DefectNodeResponse(BaseModel):
    id: int
    key: str
    title: str
    description: str
    recommendation: Optional[str]
    severity: str
    position: str
    normal: Optional[str]
    hotspot_size: Optional[float]
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int]
    updated_by: Optional[int]

    class Config:
        from_attributes = True


@router.get("", response_model=List[DefectNodeResponse])
async def list_defect_nodes(
    active_only: bool = Query(True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "violations:read", db)
    query = select(DefectNode)
    if active_only:
        query = query.where(DefectNode.is_active.is_(True))
    query = query.order_by(DefectNode.sort_order.asc(), DefectNode.id.asc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=DefectNodeResponse, status_code=status.HTTP_201_CREATED)
async def create_defect_node(
    payload: DefectNodeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_admin(current_user)
    severity = _validate_severity(payload.severity)
    node_key = _normalize_key(payload.key, payload.title)

    exists = await db.execute(select(DefectNode).where(DefectNode.key == node_key))
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Defect node key already exists")

    node = DefectNode(
        key=node_key,
        title=payload.title.strip(),
        description=payload.description.strip(),
        recommendation=(payload.recommendation.strip() if payload.recommendation else None),
        severity=severity,
        position=payload.position.strip(),
        normal=(payload.normal.strip() if payload.normal else None),
        hotspot_size=payload.hotspot_size,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(node)
    db.add(_activity(current_user.id, "create", f"Created defect node: {node.title} ({node.key})"))
    await db.commit()
    await db.refresh(node)
    return node


@router.put("/{node_id}", response_model=DefectNodeResponse)
async def update_defect_node(
    node_id: int,
    payload: DefectNodeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_admin(current_user)

    result = await db.execute(select(DefectNode).where(DefectNode.id == node_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defect node not found")

    data = payload.dict(exclude_unset=True)
    if "severity" in data and data["severity"] is not None:
        data["severity"] = _validate_severity(data["severity"])

    if "title" in data and isinstance(data["title"], str):
        data["title"] = data["title"].strip()
    if "description" in data and isinstance(data["description"], str):
        data["description"] = data["description"].strip()
    if "recommendation" in data and isinstance(data["recommendation"], str):
        data["recommendation"] = data["recommendation"].strip()
    if "position" in data and isinstance(data["position"], str):
        data["position"] = data["position"].strip()
    if "normal" in data and isinstance(data["normal"], str):
        data["normal"] = data["normal"].strip()

    next_key = None
    if "key" in data or "title" in data:
        raw_key = data.get("key", node.key)
        title_for_key = data.get("title", node.title)
        next_key = _normalize_key(raw_key, title_for_key)
        exists = await db.execute(
            select(DefectNode).where(DefectNode.key == next_key, DefectNode.id != node.id)
        )
        if exists.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Defect node key already exists")

    for field, value in data.items():
        if field == "key":
            continue
        setattr(node, field, value)
    if next_key:
        node.key = next_key
    node.updated_by = current_user.id
    node.updated_at = datetime.utcnow()

    db.add(_activity(current_user.id, "update", f"Updated defect node: {node.title} ({node.key})"))
    await db.commit()
    await db.refresh(node)
    return node


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_defect_node(
    node_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_admin(current_user)

    result = await db.execute(select(DefectNode).where(DefectNode.id == node_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defect node not found")

    await db.execute(
        update(Violation)
        .where(Violation.defect_node_id == node.id)
        .values(defect_node_id=None, updated_at=datetime.utcnow())
    )
    db.add(_activity(current_user.id, "delete", f"Deleted defect node: {node.title} ({node.key})"))
    await db.delete(node)
    await db.commit()
    return None
