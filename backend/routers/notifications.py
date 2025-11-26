from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import (
        Notification, User, UserActivity, Equipment, 
        Violation, Task, Permit
    )
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import (
        Notification, User, UserActivity, Equipment,
        Violation, Task, Permit
    )
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

class NotificationCreate(BaseModel):
    user_id: int
    title: str
    message: str
    notification_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    priority: str = "normal"

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    message: str
    notification_type: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    is_read: bool
    priority: str
    created_at: datetime
    read_at: Optional[datetime]

    class Config:
        from_attributes = True

class OverdueItemResponse(BaseModel):
    type: str  # violation, task, permit, equipment_pto, equipment_cto
    equipment_id: Optional[int]
    equipment_name: Optional[str]
    days_overdue: int
    description: str
    priority: str
    entity_id: int

async def create_notification(
    user_id: int,
    title: str,
    message: str,
    notification_type: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    priority: str = "normal",
    db: AsyncSession = None
):
    """Создать уведомление"""
    notification = Notification(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        entity_type=entity_type,
        entity_id=entity_id,
        priority=priority
    )
    db.add(notification)
    await db.flush()
    return notification

async def check_and_create_overdue_notifications(db: AsyncSession):
    """Проверить и создать уведомления о просроченных элементах"""
    now = datetime.utcnow()
    
    # Просроченные нарушения
    overdue_violations = await db.execute(
        select(Violation)
        .options(selectinload(Violation.equipment))
        .where(
            and_(
                Violation.deadline < now,
                Violation.status == "open"
            )
        )
    )
    
    for violation in overdue_violations.scalars().all():
        days_overdue = (now - violation.deadline).days
        
        # Создаем уведомления для всех активных пользователей
        users_result = await db.execute(
            select(User).where(User.is_active == True)
        )
        
        for user in users_result.scalars().all():
            # Проверяем, нет ли уже уведомления об этом нарушении
            existing = await db.execute(
                select(Notification).where(
                    and_(
                        Notification.user_id == user.id,
                        Notification.entity_type == "violation",
                        Notification.entity_id == violation.id,
                        Notification.notification_type == "overdue_violation"
                    )
                )
            )
            
            if not existing.scalar_one_or_none():
                equipment_name = f"{violation.equipment.equipment_type} {violation.equipment.passport_number}" if violation.equipment else "Неизвестное оборудование"
                
                await create_notification(
                    user_id=user.id,
                    title="Просроченное нарушение",
                    message=f"Нарушение на {equipment_name} просрочено на {days_overdue} дней",
                    notification_type="overdue_violation",
                    entity_type="violation",
                    entity_id=violation.id,
                    priority="high" if days_overdue > 30 else "normal",
                    db=db
                )
    
    # Просроченные задачи
    overdue_tasks = await db.execute(
        select(Task)
        .options(selectinload(Task.equipment), selectinload(Task.assignee))
        .where(
            and_(
                Task.due_date < now,
                Task.status.in_(["open", "in_work"])
            )
        )
    )
    
    for task in overdue_tasks.scalars().all():
        days_overdue = (now - task.due_date).days
        
        # Уведомляем назначенного пользователя
        if task.assignee:
            existing = await db.execute(
                select(Notification).where(
                    and_(
                        Notification.user_id == task.assignee.id,
                        Notification.entity_type == "task",
                        Notification.entity_id == task.id,
                        Notification.notification_type == "overdue_task"
                    )
                )
            )
            
            if not existing.scalar_one_or_none():
                await create_notification(
                    user_id=task.assignee.id,
                    title="Просроченная задача",
                    message=f"Задача '{task.title}' просрочена на {days_overdue} дней",
                    notification_type="overdue_task",
                    entity_type="task",
                    entity_id=task.id,
                    priority="high" if days_overdue > 7 else "normal",
                    db=db
                )
    
    # Просроченные ПТО/ЧТО
    overdue_equipment = await db.execute(
        select(Equipment).where(
            and_(
                Equipment.status == "active",
                or_(
                    Equipment.pto_date < now,
                    Equipment.cto_date < now
                )
            )
        )
    )
    
    for equipment in overdue_equipment.scalars().all():
        users_result = await db.execute(
            select(User).where(User.is_active == True)
        )
        
        for user in users_result.scalars().all():
            # Проверяем ПТО
            if equipment.pto_date and equipment.pto_date < now:
                days_overdue = (now - equipment.pto_date).days
                
                existing = await db.execute(
                    select(Notification).where(
                        and_(
                            Notification.user_id == user.id,
                            Notification.entity_type == "equipment",
                            Notification.entity_id == equipment.id,
                            Notification.notification_type == "overdue_pto"
                        )
                    )
                )
                
                if not existing.scalar_one_or_none():
                    await create_notification(
                        user_id=user.id,
                        title="Просроченное ПТО",
                        message=f"ПТО для {equipment.equipment_type} {equipment.passport_number} просрочено на {days_overdue} дней",
                        notification_type="overdue_pto",
                        entity_type="equipment",
                        entity_id=equipment.id,
                        priority="urgent" if days_overdue > 90 else "high",
                        db=db
                    )
            
            # Проверяем ЧТО
            if equipment.cto_date and equipment.cto_date < now:
                days_overdue = (now - equipment.cto_date).days
                
                existing = await db.execute(
                    select(Notification).where(
                        and_(
                            Notification.user_id == user.id,
                            Notification.entity_type == "equipment",
                            Notification.entity_id == equipment.id,
                            Notification.notification_type == "overdue_cto"
                        )
                    )
                )
                
                if not existing.scalar_one_or_none():
                    await create_notification(
                        user_id=user.id,
                        title="Просроченное ЧТО",
                        message=f"ЧТО для {equipment.equipment_type} {equipment.passport_number} просрочено на {days_overdue} дней",
                        notification_type="overdue_cto",
                        entity_type="equipment",
                        entity_id=equipment.id,
                        priority="high" if days_overdue > 30 else "normal",
                        db=db
                    )

@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_read: Optional[bool] = None,
    priority: Optional[str] = None,
    notification_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить уведомления для текущего пользователя"""
    query = select(Notification).where(Notification.user_id == current_user.id)
    
    if is_read is not None:
        query = query.where(Notification.is_read == is_read)
    
    if priority:
        query = query.where(Notification.priority == priority)
    
    if notification_type:
        query = query.where(Notification.notification_type == notification_type)
    
    query = query.order_by(Notification.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return [NotificationResponse.from_orm(n) for n in notifications]

@router.get("/overdue", response_model=List[OverdueItemResponse])
async def get_overdue_items(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить все просроченные элементы"""
    await require_permission(current_user, "notifications:read", db)
    
    now = datetime.utcnow()
    overdue_items = []
    
    # Просроченные нарушения
    overdue_violations = await db.execute(
        select(Violation)
        .options(selectinload(Violation.equipment))
        .where(
            and_(
                Violation.deadline < now,
                Violation.status == "open"
            )
        )
    )
    
    for violation in overdue_violations.scalars().all():
        days_overdue = (now - violation.deadline).days
        equipment_name = f"{violation.equipment.equipment_type} {violation.equipment.passport_number}" if violation.equipment else "Неизвестное оборудование"
        
        overdue_items.append(OverdueItemResponse(
            type="violation",
            equipment_id=violation.equipment_id,
            equipment_name=equipment_name,
            days_overdue=days_overdue,
            description=violation.description[:100] + "..." if len(violation.description) > 100 else violation.description,
            priority=violation.severity,
            entity_id=violation.id
        ))
    
    # Просроченные задачи
    overdue_tasks = await db.execute(
        select(Task)
        .options(selectinload(Task.equipment))
        .where(
            and_(
                Task.due_date < now,
                Task.status.in_(["open", "in_work"])
            )
        )
    )
    
    for task in overdue_tasks.scalars().all():
        days_overdue = (now - task.due_date).days
        equipment_name = f"{task.equipment.equipment_type} {task.equipment.passport_number}" if task.equipment else None
        
        overdue_items.append(OverdueItemResponse(
            type="task",
            equipment_id=task.equipment_id,
            equipment_name=equipment_name,
            days_overdue=days_overdue,
            description=task.title,
            priority=task.priority,
            entity_id=task.id
        ))
    
    # Просроченные ПТО
    overdue_pto = await db.execute(
        select(Equipment).where(
            and_(
                Equipment.status == "active",
                Equipment.pto_date < now
            )
        )
    )
    
    for equipment in overdue_pto.scalars().all():
        days_overdue = (now - equipment.pto_date).days
        equipment_name = f"{equipment.equipment_type} {equipment.passport_number}"
        
        overdue_items.append(OverdueItemResponse(
            type="equipment_pto",
            equipment_id=equipment.id,
            equipment_name=equipment_name,
            days_overdue=days_overdue,
            description=f"ПТО просрочено на {days_overdue} дней",
            priority="urgent" if days_overdue > 90 else "high",
            entity_id=equipment.id
        ))
    
    # Просроченные ЧТО
    overdue_cto = await db.execute(
        select(Equipment).where(
            and_(
                Equipment.status == "active",
                Equipment.cto_date < now
            )
        )
    )
    
    for equipment in overdue_cto.scalars().all():
        days_overdue = (now - equipment.cto_date).days
        equipment_name = f"{equipment.equipment_type} {equipment.passport_number}"
        
        overdue_items.append(OverdueItemResponse(
            type="equipment_cto",
            equipment_id=equipment.id,
            equipment_name=equipment_name,
            days_overdue=days_overdue,
            description=f"ЧТО просрочено на {days_overdue} дней",
            priority="high" if days_overdue > 30 else "normal",
            entity_id=equipment.id
        ))
    
    # Сортируем по убыванию дней просрочки
    overdue_items.sort(key=lambda x: x.days_overdue, reverse=True)
    
    return overdue_items

@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отметить уведомление как прочитанное"""
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.id
            )
        )
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        await db.commit()
    
    return NotificationResponse.from_orm(notification)

@router.post("/mark-all-read")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отметить все уведомления как прочитанные"""
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.user_id == current_user.id,
                Notification.is_read == False
            )
        )
    )
    notifications = result.scalars().all()
    
    count = 0
    for notification in notifications:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        count += 1
    
    await db.commit()
    
    return {"marked_read": count}

@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить уведомление"""
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.id
            )
        )
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    await db.delete(notification)
    await db.commit()
    return None

@router.post("/generate-overdue")
async def generate_overdue_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Генерировать уведомления о просроченных элементах (для админов)"""
    await require_permission(current_user, "notifications:create", db)
    
    await check_and_create_overdue_notifications(db)
    await db.commit()
    
    return {"message": "Overdue notifications generated successfully"}

@router.get("/stats")
async def get_notification_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить статистику уведомлений"""
    # Общее количество
    total_result = await db.execute(
        select(func.count(Notification.id)).where(Notification.user_id == current_user.id)
    )
    total = total_result.scalar()
    
    # Непрочитанные
    unread_result = await db.execute(
        select(func.count(Notification.id)).where(
            and_(
                Notification.user_id == current_user.id,
                Notification.is_read == False
            )
        )
    )
    unread = unread_result.scalar()
    
    # По приоритетам
    priority_result = await db.execute(
        select(
            Notification.priority,
            func.count(Notification.id)
        ).where(
            and_(
                Notification.user_id == current_user.id,
                Notification.is_read == False
            )
        ).group_by(Notification.priority)
    )
    
    priority_stats = {row[0]: row[1] for row in priority_result}
    
    return {
        "total": total,
        "unread": unread,
        "read": total - unread,
        "priority_breakdown": priority_stats
    }
