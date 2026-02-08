from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

try:
    from backend.auth import get_current_user, require_permission
    from backend.database import get_db
    from backend.models import (
        Act,
        ActViolation,
        Equipment,
        Inspection,
        Task,
        User,
        UserActivity,
        Violation,
    )
except ImportError:
    from ..auth import get_current_user, require_permission
    from ..database import get_db
    from ..models import (
        Act,
        ActViolation,
        Equipment,
        Inspection,
        Task,
        User,
        UserActivity,
        Violation,
    )


router = APIRouter(prefix="/api/workflow", tags=["workflow"])


class CreateTaskFromViolationRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    force_create: bool = False


class CreateTaskFromViolationResponse(BaseModel):
    created: bool
    task_id: int
    violation_id: int
    equipment_id: Optional[int] = None
    task_status: str


class CreateActFromViolationRequest(BaseModel):
    organization: Optional[str] = None
    additional_violation_ids: List[int] = []
    force_create: bool = False


class CreateActFromViolationResponse(BaseModel):
    created: bool
    act_id: int
    act_number: str
    violation_ids: List[int]
    status: str


class CloseWorkflowByActRequest(BaseModel):
    resolve_violations: bool = True
    complete_tasks: bool = True
    complete_inspection: bool = True
    act_status: str = "signed"
    comment: Optional[str] = None


class CloseWorkflowByActResponse(BaseModel):
    act_id: int
    act_status: str
    resolved_violations: int
    completed_tasks: int
    completed_inspection: bool


class WorkflowCaseResponse(BaseModel):
    violation_id: int
    violation_status: str
    violation_severity: str
    task_ids: List[int]
    open_task_ids: List[int]
    act_ids: List[int]
    draft_act_ids: List[int]


class WorkflowEquipmentResponse(BaseModel):
    equipment_id: int
    passport_number: str
    equipment_type: str
    workshop: Optional[str] = None
    inspections_total: int
    inspections_completed: int
    violations_open: int
    violations_resolved: int
    tasks_open: int
    tasks_in_work: int
    tasks_completed: int
    acts_draft: int
    acts_signed: int
    acts_archived: int
    acts_completed: int
    last_inspection_at: Optional[datetime] = None
    cases: List[WorkflowCaseResponse]


class WorkflowOverviewItem(BaseModel):
    equipment_id: int
    passport_number: str
    equipment_type: str
    workshop: Optional[str] = None
    inspections_total: int
    inspections_completed: int
    violations_open: int
    tasks_open: int
    tasks_in_work: int
    acts_draft: int
    acts_signed: int
    acts_completed: int
    last_inspection_at: Optional[datetime] = None


async def _require_any_permission(user: User, db: AsyncSession, permissions: List[str]) -> None:
    last_error: Optional[HTTPException] = None
    for permission in permissions:
        try:
            await require_permission(user, permission, db)
            return
        except HTTPException as exc:
            if exc.status_code != status.HTTP_403_FORBIDDEN:
                raise
            last_error = exc
    if last_error:
        raise last_error
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")


def _default_task_priority(violation_severity: str) -> str:
    if violation_severity == "critical":
        return "urgent"
    if violation_severity == "high":
        return "high"
    if violation_severity == "low":
        return "low"
    return "medium"


def _default_task_title(violation: Violation) -> str:
    suffix = (violation.violation_type or "").strip()
    if suffix:
        return f"Устранить нарушение #{violation.id}: {suffix[:90]}"
    short_desc = (violation.description or "").strip().replace("\n", " ")
    if short_desc:
        return f"Устранить нарушение #{violation.id}: {short_desc[:90]}"
    return f"Устранить нарушение #{violation.id}"


async def _generate_act_number(db: AsyncSession) -> str:
    today = date.today()
    pattern = f"АКТ-{today.year}-{today.month:02d}-%"
    result = await db.execute(select(Act.id).where(Act.act_number.like(pattern)))
    count = len(result.scalars().all()) + 1
    return f"АКТ-{today.year}-{today.month:02d}-{count:04d}"


@router.post(
    "/violations/{violation_id}/task",
    response_model=CreateTaskFromViolationResponse,
)
async def create_task_from_violation(
    violation_id: int,
    payload: CreateTaskFromViolationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_any_permission(
        current_user,
        db,
        ["tasks:create", "violations:update", "violations:create"],
    )

    violation_result = await db.execute(select(Violation).where(Violation.id == violation_id))
    violation = violation_result.scalar_one_or_none()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    existing_task_result = await db.execute(
        select(Task)
        .where(
            and_(
                Task.violation_id == violation.id,
                Task.status.in_(["open", "in_work"]),
            )
        )
        .order_by(Task.created_at.desc())
    )
    existing_task = existing_task_result.scalars().first()
    if existing_task and not payload.force_create:
        return CreateTaskFromViolationResponse(
            created=False,
            task_id=existing_task.id,
            violation_id=violation.id,
            equipment_id=violation.equipment_id,
            task_status=existing_task.status,
        )

    if payload.assignee_id is not None:
        assignee_result = await db.execute(select(User).where(User.id == payload.assignee_id))
        if not assignee_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Assignee not found")

    new_task = Task(
        title=(payload.title or _default_task_title(violation)).strip(),
        description=payload.description or violation.description,
        equipment_id=violation.equipment_id,
        violation_id=violation.id,
        assignee_id=payload.assignee_id,
        created_by=current_user.id,
        status="open",
        priority=payload.priority or _default_task_priority(violation.severity),
        due_date=payload.due_date or violation.deadline,
    )
    db.add(new_task)
    await db.flush()

    db.add(
        UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="task",
            entity_id=new_task.id,
            description=f"Workflow: created task from violation #{violation.id}",
        )
    )

    await db.commit()
    return CreateTaskFromViolationResponse(
        created=True,
        task_id=new_task.id,
        violation_id=violation.id,
        equipment_id=violation.equipment_id,
        task_status=new_task.status,
    )


@router.post(
    "/violations/{violation_id}/act",
    response_model=CreateActFromViolationResponse,
)
async def create_act_from_violation(
    violation_id: int,
    payload: CreateActFromViolationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_any_permission(current_user, db, ["acts:create", "violations:update"])

    violation_result = await db.execute(select(Violation).where(Violation.id == violation_id))
    violation = violation_result.scalar_one_or_none()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")

    existing_draft_result = await db.execute(
        select(Act)
        .join(ActViolation, ActViolation.act_id == Act.id)
        .where(
            and_(
                ActViolation.violation_id == violation.id,
                Act.status == "draft",
            )
        )
        .order_by(Act.created_at.desc())
    )
    existing_draft = existing_draft_result.scalars().first()
    if existing_draft and not payload.force_create:
        linked_result = await db.execute(
            select(ActViolation.violation_id).where(ActViolation.act_id == existing_draft.id)
        )
        linked_ids = linked_result.scalars().all()
        return CreateActFromViolationResponse(
            created=False,
            act_id=existing_draft.id,
            act_number=existing_draft.act_number,
            violation_ids=linked_ids,
            status=existing_draft.status,
        )

    raw_ids = [violation.id, *payload.additional_violation_ids]
    unique_ids = list(dict.fromkeys([v_id for v_id in raw_ids if v_id > 0]))

    violations_result = await db.execute(select(Violation).where(Violation.id.in_(unique_ids)))
    violations = violations_result.scalars().all()
    found_ids = {v.id for v in violations}
    missing = [v_id for v_id in unique_ids if v_id not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Violations not found: {missing}")

    act_number = await _generate_act_number(db)
    organization = (payload.organization or current_user.organization or "Не указано").strip()

    new_act = Act(
        act_number=act_number,
        act_date=datetime.utcnow(),
        organization=organization,
        equipment_id=violation.equipment_id,
        inspection_id=violation.inspection_id,
        status="draft",
        created_by=current_user.id,
    )
    db.add(new_act)
    await db.flush()

    for v in violations:
        db.add(ActViolation(act_id=new_act.id, violation_id=v.id))

    db.add(
        UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="act",
            entity_id=new_act.id,
            description=f"Workflow: created act from violation #{violation.id}",
        )
    )

    await db.commit()
    return CreateActFromViolationResponse(
        created=True,
        act_id=new_act.id,
        act_number=new_act.act_number,
        violation_ids=unique_ids,
        status=new_act.status,
    )


@router.post(
    "/acts/{act_id}/close",
    response_model=CloseWorkflowByActResponse,
)
async def close_workflow_by_act(
    act_id: int,
    payload: CloseWorkflowByActRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_any_permission(current_user, db, ["acts:update", "violations:update"])

    if payload.act_status not in ["signed", "completed", "archived"]:
        raise HTTPException(status_code=400, detail="Unsupported act status")

    act_result = await db.execute(
        select(Act).options(selectinload(Act.violations)).where(Act.id == act_id)
    )
    act = act_result.scalar_one_or_none()
    if not act:
        raise HTTPException(status_code=404, detail="Act not found")

    now = datetime.utcnow()
    act.status = payload.act_status
    act.updated_at = now

    violation_ids = [item.violation_id for item in act.violations]
    resolved_violations = 0
    completed_tasks = 0
    completed_inspection = False

    if payload.resolve_violations and violation_ids:
        violations_result = await db.execute(select(Violation).where(Violation.id.in_(violation_ids)))
        for violation in violations_result.scalars().all():
            if violation.status != "resolved":
                violation.status = "resolved"
                violation.resolved_at = now
                violation.resolved_by = current_user.id
                violation.updated_at = now
                resolved_violations += 1

    if payload.complete_tasks and violation_ids:
        tasks_result = await db.execute(
            select(Task).where(
                and_(
                    Task.violation_id.in_(violation_ids),
                    Task.status.in_(["open", "in_work"]),
                )
            )
        )
        for task in tasks_result.scalars().all():
            task.status = "completed"
            task.completed_at = now
            task.updated_at = now
            if task.started_at is None:
                task.started_at = now
            completed_tasks += 1

    if payload.complete_inspection and act.inspection_id:
        inspection_result = await db.execute(
            select(Inspection).where(Inspection.id == act.inspection_id)
        )
        inspection = inspection_result.scalar_one_or_none()
        if inspection and inspection.status != "completed":
            inspection.status = "completed"
            if inspection.started_at is None:
                inspection.started_at = now
            inspection.completed_at = now
            inspection.updated_at = now
            completed_inspection = True

    comment = f". {payload.comment}" if payload.comment else ""
    db.add(
        UserActivity(
            user_id=current_user.id,
            action_type="update",
            entity_type="act",
            entity_id=act.id,
            description=f"Workflow: close by act #{act.id}{comment}",
        )
    )

    await db.commit()
    return CloseWorkflowByActResponse(
        act_id=act.id,
        act_status=act.status,
        resolved_violations=resolved_violations,
        completed_tasks=completed_tasks,
        completed_inspection=completed_inspection,
    )


@router.get("/overview", response_model=List[WorkflowOverviewItem])
async def get_workflow_overview(
    skip: int = 0,
    limit: int = 100,
    workshop: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_any_permission(
        current_user,
        db,
        ["equipment:read", "inspections:read", "violations:read"],
    )

    equipment_query = select(Equipment).order_by(Equipment.updated_at.desc()).offset(skip).limit(limit)
    if workshop:
        equipment_query = equipment_query.where(Equipment.workshop == workshop)

    equipment_result = await db.execute(equipment_query)
    equipment_list = equipment_result.scalars().all()
    if not equipment_list:
        return []

    equipment_ids = [item.id for item in equipment_list]

    inspections_result = await db.execute(
        select(Inspection).where(Inspection.equipment_id.in_(equipment_ids))
    )
    inspections = inspections_result.scalars().all()

    violations_result = await db.execute(
        select(Violation).where(Violation.equipment_id.in_(equipment_ids))
    )
    violations = violations_result.scalars().all()

    tasks_result = await db.execute(select(Task).where(Task.equipment_id.in_(equipment_ids)))
    tasks = tasks_result.scalars().all()

    acts_result = await db.execute(select(Act).where(Act.equipment_id.in_(equipment_ids)))
    acts = acts_result.scalars().all()

    inspections_by_eq: dict[int, list[Inspection]] = {}
    for item in inspections:
        inspections_by_eq.setdefault(item.equipment_id, []).append(item)

    violations_by_eq: dict[int, list[Violation]] = {}
    for item in violations:
        violations_by_eq.setdefault(item.equipment_id, []).append(item)

    tasks_by_eq: dict[int, list[Task]] = {}
    for item in tasks:
        if item.equipment_id is not None:
            tasks_by_eq.setdefault(item.equipment_id, []).append(item)

    acts_by_eq: dict[int, list[Act]] = {}
    for item in acts:
        if item.equipment_id is not None:
            acts_by_eq.setdefault(item.equipment_id, []).append(item)

    response: List[WorkflowOverviewItem] = []
    for equipment in equipment_list:
        eq_inspections = inspections_by_eq.get(equipment.id, [])
        eq_violations = violations_by_eq.get(equipment.id, [])
        eq_tasks = tasks_by_eq.get(equipment.id, [])
        eq_acts = acts_by_eq.get(equipment.id, [])

        inspections_completed = sum(1 for item in eq_inspections if item.status == "completed")
        open_violations = sum(1 for item in eq_violations if item.status != "resolved")
        tasks_open = sum(1 for item in eq_tasks if item.status == "open")
        tasks_in_work = sum(1 for item in eq_tasks if item.status == "in_work")
        acts_draft = sum(1 for item in eq_acts if item.status == "draft")
        acts_signed = sum(1 for item in eq_acts if item.status == "signed")
        acts_completed = sum(1 for item in eq_acts if item.status == "completed")
        last_inspection_at = max(
            [item.updated_at for item in eq_inspections if item.updated_at is not None],
            default=None,
        )

        response.append(
            WorkflowOverviewItem(
                equipment_id=equipment.id,
                passport_number=equipment.passport_number,
                equipment_type=equipment.equipment_type,
                workshop=equipment.workshop,
                inspections_total=len(eq_inspections),
                inspections_completed=inspections_completed,
                violations_open=open_violations,
                tasks_open=tasks_open,
                tasks_in_work=tasks_in_work,
                acts_draft=acts_draft,
                acts_signed=acts_signed,
                acts_completed=acts_completed,
                last_inspection_at=last_inspection_at,
            )
        )

    return response


@router.get("/equipment/{equipment_id}", response_model=WorkflowEquipmentResponse)
async def get_equipment_workflow(
    equipment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_any_permission(
        current_user,
        db,
        ["equipment:read", "inspections:read", "violations:read"],
    )

    equipment_result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    equipment = equipment_result.scalar_one_or_none()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")

    inspections_result = await db.execute(
        select(Inspection).where(Inspection.equipment_id == equipment.id)
    )
    inspections = inspections_result.scalars().all()

    violations_result = await db.execute(
        select(Violation).where(Violation.equipment_id == equipment.id)
    )
    violations = violations_result.scalars().all()

    tasks_result = await db.execute(select(Task).where(Task.equipment_id == equipment.id))
    tasks = tasks_result.scalars().all()

    acts_result = await db.execute(
        select(Act).options(selectinload(Act.violations)).where(Act.equipment_id == equipment.id)
    )
    acts = acts_result.scalars().all()

    act_ids_by_violation: dict[int, list[int]] = {}
    draft_act_ids_by_violation: dict[int, list[int]] = {}
    for act in acts:
        for link in act.violations:
            act_ids_by_violation.setdefault(link.violation_id, []).append(act.id)
            if act.status == "draft":
                draft_act_ids_by_violation.setdefault(link.violation_id, []).append(act.id)

    task_ids_by_violation: dict[int, list[int]] = {}
    open_task_ids_by_violation: dict[int, list[int]] = {}
    for task in tasks:
        if task.violation_id is None:
            continue
        task_ids_by_violation.setdefault(task.violation_id, []).append(task.id)
        if task.status in ["open", "in_work"]:
            open_task_ids_by_violation.setdefault(task.violation_id, []).append(task.id)

    cases: List[WorkflowCaseResponse] = []
    for violation in sorted(violations, key=lambda item: item.created_at, reverse=True):
        cases.append(
            WorkflowCaseResponse(
                violation_id=violation.id,
                violation_status=violation.status,
                violation_severity=violation.severity,
                task_ids=task_ids_by_violation.get(violation.id, []),
                open_task_ids=open_task_ids_by_violation.get(violation.id, []),
                act_ids=act_ids_by_violation.get(violation.id, []),
                draft_act_ids=draft_act_ids_by_violation.get(violation.id, []),
            )
        )

    completed_inspections = sum(1 for item in inspections if item.status == "completed")
    open_violations = sum(1 for item in violations if item.status != "resolved")
    resolved_violations = len(violations) - open_violations
    tasks_open = sum(1 for item in tasks if item.status == "open")
    tasks_in_work = sum(1 for item in tasks if item.status == "in_work")
    tasks_completed = sum(1 for item in tasks if item.status == "completed")
    acts_draft = sum(1 for item in acts if item.status == "draft")
    acts_signed = sum(1 for item in acts if item.status == "signed")
    acts_archived = sum(1 for item in acts if item.status == "archived")
    acts_completed = sum(1 for item in acts if item.status == "completed")
    last_inspection_at = max(
        [item.updated_at for item in inspections if item.updated_at is not None],
        default=None,
    )

    return WorkflowEquipmentResponse(
        equipment_id=equipment.id,
        passport_number=equipment.passport_number,
        equipment_type=equipment.equipment_type,
        workshop=equipment.workshop,
        inspections_total=len(inspections),
        inspections_completed=completed_inspections,
        violations_open=open_violations,
        violations_resolved=resolved_violations,
        tasks_open=tasks_open,
        tasks_in_work=tasks_in_work,
        tasks_completed=tasks_completed,
        acts_draft=acts_draft,
        acts_signed=acts_signed,
        acts_archived=acts_archived,
        acts_completed=acts_completed,
        last_inspection_at=last_inspection_at,
        cases=cases,
    )
