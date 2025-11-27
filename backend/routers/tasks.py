from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import Task, Equipment, Violation, User, UserActivity
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import Task, Equipment, Violation, User, UserActivity
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    equipment_id: Optional[int] = None
    violation_id: Optional[int] = None
    assignee_id: Optional[int] = None
    priority: str = "medium"  # low, medium, high, urgent
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    notes: Optional[str] = None

class TaskStatusUpdate(BaseModel):
    status: str  # open, in_work, completed, cancelled

class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    equipment_id: Optional[int]
    violation_id: Optional[int]
    assignee_id: Optional[int]
    created_by: int
    status: str
    priority: str
    due_date: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    estimated_hours: Optional[float]
    actual_hours: Optional[float]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    # Связанные объекты
    equipment: Optional[dict] = None
    violation: Optional[dict] = None
    assignee: Optional[dict] = None
    creator: Optional[dict] = None

    class Config:
        from_attributes = True

def _task_to_response(task: Task) -> TaskResponse:
    """Преобразование Task в TaskResponse"""
    equipment_data = None
    if hasattr(task, 'equipment') and task.equipment:
        equipment_data = {
            "id": task.equipment.id,
            "equipment_type": task.equipment.equipment_type,
            "passport_number": task.equipment.passport_number,
            "position": task.equipment.position
        }
    
    violation_data = None
    if hasattr(task, 'violation') and task.violation:
        violation_data = {
            "id": task.violation.id,
            "description": task.violation.description,
            "severity": task.violation.severity,
            "status": task.violation.status
        }
    
    assignee_data = None
    if hasattr(task, 'assignee') and task.assignee:
        assignee_data = {
            "id": task.assignee.id,
            "username": task.assignee.username,
            "full_name": task.assignee.full_name
        }
    
    creator_data = None
    if hasattr(task, 'creator') and task.creator:
        creator_data = {
            "id": task.creator.id,
            "username": task.creator.username,
            "full_name": task.creator.full_name
        }
    
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        equipment_id=task.equipment_id,
        violation_id=task.violation_id,
        assignee_id=task.assignee_id,
        created_by=task.created_by,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        started_at=task.started_at,
        completed_at=task.completed_at,
        estimated_hours=task.estimated_hours,
        actual_hours=task.actual_hours,
        notes=task.notes,
        created_at=task.created_at,
        updated_at=task.updated_at,
        equipment=equipment_data,
        violation=violation_data,
        assignee=assignee_data,
        creator=creator_data
    )

@router.get("", response_model=List[TaskResponse])
async def get_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None,
    equipment_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список задач"""
    await require_permission(current_user, "tasks:read", db)
    
    query = select(Task).options(
        selectinload(Task.equipment),
        selectinload(Task.violation),
        selectinload(Task.assignee),
        selectinload(Task.creator)
    )
    
    if status:
        query = query.where(Task.status == status)
    
    if priority:
        query = query.where(Task.priority == priority)
    
    if assignee_id:
        query = query.where(Task.assignee_id == assignee_id)
    
    if equipment_id:
        query = query.where(Task.equipment_id == equipment_id)
    
    query = query.order_by(Task.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return [_task_to_response(task) for task in tasks]

@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить задачу по ID"""
    await require_permission(current_user, "tasks:read", db)
    
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment),
            selectinload(Task.violation),
            selectinload(Task.assignee),
            selectinload(Task.creator)
        )
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return _task_to_response(task)

@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новую задачу"""
    await require_permission(current_user, "tasks:create", db)
    
    # Проверяем существование связанных объектов
    if task_data.equipment_id:
        eq_result = await db.execute(select(Equipment).where(Equipment.id == task_data.equipment_id))
        if not eq_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Equipment not found")
    
    if task_data.violation_id:
        viol_result = await db.execute(select(Violation).where(Violation.id == task_data.violation_id))
        if not viol_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Violation not found")
    
    if task_data.assignee_id:
        user_result = await db.execute(select(User).where(User.id == task_data.assignee_id))
        if not user_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Assignee not found")
    
    new_task = Task(
        title=task_data.title,
        description=task_data.description,
        equipment_id=task_data.equipment_id,
        violation_id=task_data.violation_id,
        assignee_id=task_data.assignee_id,
        created_by=current_user.id,
        priority=task_data.priority,
        due_date=task_data.due_date,
        estimated_hours=task_data.estimated_hours,
        status="open"
    )
    db.add(new_task)
    await db.flush()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="task",
        entity_id=new_task.id,
        description=f"Created task: {new_task.title}"
    )
    db.add(activity)
    
    await db.commit()
    
    # Загружаем связанные объекты
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment),
            selectinload(Task.violation),
            selectinload(Task.assignee),
            selectinload(Task.creator)
        )
        .where(Task.id == new_task.id)
    )
    created_task = result.scalar_one()
    
    return _task_to_response(created_task)

@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int,
    task_data: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить задачу"""
    await require_permission(current_user, "tasks:update", db)
    
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Проверяем связанные объекты если они обновляются
    if task_data.assignee_id is not None:
        user_result = await db.execute(select(User).where(User.id == task_data.assignee_id))
        if not user_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Assignee not found")
    
    update_data = task_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)
    
    task.updated_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="task",
        entity_id=task.id,
        description=f"Updated task: {task.title}"
    )
    db.add(activity)
    
    await db.commit()
    
    # Загружаем обновленную задачу со связанными объектами
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment),
            selectinload(Task.violation),
            selectinload(Task.assignee),
            selectinload(Task.creator)
        )
        .where(Task.id == task.id)
    )
    updated_task = result.scalar_one()
    
    return _task_to_response(updated_task)

@router.post("/{task_id}/status", response_model=TaskResponse)
async def update_task_status(
    task_id: int,
    status_data: TaskStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить статус задачи"""
    await require_permission(current_user, "tasks:update", db)
    
    if status_data.status not in ["open", "in_work", "completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    old_status = task.status
    task.status = status_data.status
    task.updated_at = datetime.utcnow()
    
    # Обновляем временные метки
    if status_data.status == "in_work" and not task.started_at:
        task.started_at = datetime.utcnow()
    elif status_data.status == "completed" and not task.completed_at:
        task.completed_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="task",
        entity_id=task.id,
        description=f"Changed task status from {old_status} to {status_data.status}: {task.title}"
    )
    db.add(activity)
    
    await db.commit()
    
    # Загружаем обновленную задачу со связанными объектами
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.equipment),
            selectinload(Task.violation),
            selectinload(Task.assignee),
            selectinload(Task.creator)
        )
        .where(Task.id == task.id)
    )
    updated_task = result.scalar_one()
    
    return _task_to_response(updated_task)

@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить задачу"""
    await require_permission(current_user, "tasks:delete", db)
    
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="task",
        entity_id=task.id,
        description=f"Deleted task: {task.title}"
    )
    db.add(activity)
    
    await db.delete(task)
    await db.commit()
    return None


