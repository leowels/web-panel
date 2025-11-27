from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, case, text
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel
import json

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import (
        Equipment, Violation, Task, User, UserActivity, 
        AnalyticsCache
    )
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import (
        Equipment, Violation, Task, User, UserActivity,
        AnalyticsCache
    )
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

class RiskFactorResponse(BaseModel):
    factor: str
    weight: float
    description: str

class EquipmentRiskResponse(BaseModel):
    equipment_id: int
    risk_score: int
    factors: List[str]
    recommendation: str

class RiskOverviewResponse(BaseModel):
    high_risk: List[Dict[str, Any]]
    total_equipment: int
    risk_distribution: Dict[str, int]

class MechanicKPIResponse(BaseModel):
    id: int
    name: str
    completed_tasks: int
    avg_time: float
    efficiency_score: float

class ViolationDynamicsResponse(BaseModel):
    periods: List[Dict[str, Any]]
    trends: Dict[str, Any]

async def get_cached_analytics(cache_key: str, db: AsyncSession) -> Optional[Dict]:
    """Получить кэшированные данные аналитики"""
    result = await db.execute(
        select(AnalyticsCache).where(
            and_(
                AnalyticsCache.cache_key == cache_key,
                AnalyticsCache.expires_at > datetime.utcnow()
            )
        )
    )
    cache_entry = result.scalar_one_or_none()
    
    if cache_entry:
        return cache_entry.data
    return None

async def set_analytics_cache(cache_key: str, data: Dict, ttl_minutes: int, db: AsyncSession):
    """Сохранить данные в кэш аналитики"""
    expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)
    
    # Удаляем старую запись если есть
    result = await db.execute(
        select(AnalyticsCache).where(AnalyticsCache.cache_key == cache_key)
    )
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
    
    # Создаем новую
    cache_entry = AnalyticsCache(
        cache_key=cache_key,
        data=data,
        expires_at=expires_at
    )
    db.add(cache_entry)
    await db.flush()

def calculate_equipment_risk_score(equipment: Equipment, violations: List[Violation], tasks: List[Task]) -> tuple[int, List[str]]:
    """Вычисление риска оборудования"""
    risk_score = 0
    factors = []
    
    # Фактор 1: Возраст оборудования
    if equipment.installation_date:
        age_years = (datetime.utcnow() - equipment.installation_date).days / 365.25
        if age_years > 20:
            risk_score += 30
            factors.append("Возраст оборудования более 20 лет")
        elif age_years > 10:
            risk_score += 15
            factors.append("Возраст оборудования более 10 лет")
    
    # Фактор 2: Просроченные проверки
    now = datetime.utcnow()
    if equipment.pto_date and equipment.pto_date < now:
        days_overdue = (now - equipment.pto_date).days
        if days_overdue > 90:
            risk_score += 40
            factors.append(f"ПТО просрочено на {days_overdue} дней")
        elif days_overdue > 30:
            risk_score += 20
            factors.append(f"ПТО просрочено на {days_overdue} дней")
    
    if equipment.cto_date and equipment.cto_date < now:
        days_overdue = (now - equipment.cto_date).days
        if days_overdue > 30:
            risk_score += 25
            factors.append(f"ЧТО просрочено на {days_overdue} дней")
    
    # Фактор 3: Количество нарушений
    open_violations = [v for v in violations if v.status == "open"]
    critical_violations = [v for v in violations if v.severity == "critical"]
    
    if len(critical_violations) > 0:
        risk_score += 35
        factors.append(f"Критических нарушений: {len(critical_violations)}")
    
    if len(open_violations) > 5:
        risk_score += 25
        factors.append(f"Открытых нарушений: {len(open_violations)}")
    elif len(open_violations) > 2:
        risk_score += 15
        factors.append(f"Открытых нарушений: {len(open_violations)}")
    
    # Фактор 4: Просроченные задачи
    overdue_tasks = [t for t in tasks if t.due_date and t.due_date < now and t.status != "completed"]
    if len(overdue_tasks) > 0:
        risk_score += 20
        factors.append(f"Просроченных задач: {len(overdue_tasks)}")
    
    # Ограничиваем максимальный риск
    risk_score = min(risk_score, 100)
    
    return risk_score, factors

def get_risk_recommendation(risk_score: int, factors: List[str]) -> str:
    """Получить рекомендации на основе риска"""
    if risk_score >= 80:
        return "КРИТИЧЕСКИЙ РИСК: Немедленно остановить эксплуатацию и провести внеочередную проверку"
    elif risk_score >= 60:
        return "ВЫСОКИЙ РИСК: Запланировать проверку в течение недели, ограничить нагрузку"
    elif risk_score >= 40:
        return "СРЕДНИЙ РИСК: Запланировать проверку в течение месяца, усилить контроль"
    elif risk_score >= 20:
        return "НИЗКИЙ РИСК: Плановые проверки, стандартный контроль"
    else:
        return "МИНИМАЛЬНЫЙ РИСК: Стандартная эксплуатация"

@router.get("/equipment/{equipment_id}/risk", response_model=EquipmentRiskResponse)
async def get_equipment_risk(
    equipment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить оценку риска для конкретного оборудования"""
    await require_permission(current_user, "analytics:read", db)
    
    # Проверяем кэш
    cache_key = f"equipment_risk_{equipment_id}"
    cached_data = await get_cached_analytics(cache_key, db)
    if cached_data:
        return EquipmentRiskResponse(**cached_data)
    
    # Получаем оборудование
    eq_result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    equipment = eq_result.scalar_one_or_none()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    # Получаем нарушения
    viol_result = await db.execute(
        select(Violation).where(Violation.equipment_id == equipment_id)
    )
    violations = viol_result.scalars().all()
    
    # Получаем задачи
    task_result = await db.execute(
        select(Task).where(Task.equipment_id == equipment_id)
    )
    tasks = task_result.scalars().all()
    
    # Вычисляем риск
    risk_score, factors = calculate_equipment_risk_score(equipment, violations, tasks)
    recommendation = get_risk_recommendation(risk_score, factors)
    
    response_data = {
        "equipment_id": equipment_id,
        "risk_score": risk_score,
        "factors": factors,
        "recommendation": recommendation
    }
    
    # Кэшируем на 1 час
    await set_analytics_cache(cache_key, response_data, 60, db)
    await db.commit()
    
    return EquipmentRiskResponse(**response_data)

@router.get("/risk-overview", response_model=RiskOverviewResponse)
async def get_risk_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить общий обзор рисков по всему оборудованию"""
    await require_permission(current_user, "analytics:read", db)
    
    # Проверяем кэш
    cache_key = "risk_overview"
    cached_data = await get_cached_analytics(cache_key, db)
    if cached_data:
        return RiskOverviewResponse(**cached_data)
    
    # Получаем все оборудование
    eq_result = await db.execute(select(Equipment).where(Equipment.status == "active"))
    all_equipment = eq_result.scalars().all()
    
    high_risk_equipment = []
    risk_distribution = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    
    for equipment in all_equipment:
        # Получаем нарушения для каждого оборудования
        viol_result = await db.execute(
            select(Violation).where(Violation.equipment_id == equipment.id)
        )
        violations = viol_result.scalars().all()
        
        # Получаем задачи
        task_result = await db.execute(
            select(Task).where(Task.equipment_id == equipment.id)
        )
        tasks = task_result.scalars().all()
        
        # Вычисляем риск
        risk_score, factors = calculate_equipment_risk_score(equipment, violations, tasks)
        
        # Классифицируем риск
        if risk_score >= 80:
            risk_level = "critical"
        elif risk_score >= 60:
            risk_level = "high"
        elif risk_score >= 40:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        risk_distribution[risk_level] += 1
        
        # Добавляем в список высокого риска
        if risk_score >= 60:
            high_risk_equipment.append({
                "id": equipment.id,
                "name": f"{equipment.equipment_type} {equipment.passport_number}",
                "risk_score": risk_score,
                "position": equipment.position,
                "workshop": equipment.workshop
            })
    
    # Сортируем по убыванию риска
    high_risk_equipment.sort(key=lambda x: x["risk_score"], reverse=True)
    
    response_data = {
        "high_risk": high_risk_equipment,
        "total_equipment": len(all_equipment),
        "risk_distribution": risk_distribution
    }
    
    # Кэшируем на 30 минут
    await set_analytics_cache(cache_key, response_data, 30, db)
    await db.commit()
    
    return RiskOverviewResponse(**response_data)

@router.get("/kpi-mechanics", response_model=List[MechanicKPIResponse])
async def get_mechanics_kpi(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить KPI механиков"""
    await require_permission(current_user, "analytics:read", db)
    
    # Проверяем кэш
    cache_key = "mechanics_kpi"
    cached_data = await get_cached_analytics(cache_key, db)
    if cached_data:
        return [MechanicKPIResponse(**item) for item in cached_data]
    
    # Получаем статистику по пользователям с завершенными задачами
    query = text("""
        SELECT 
            u.id,
            u.full_name as name,
            COUNT(t.id) as completed_tasks,
            AVG(
                CASE 
                    WHEN t.actual_hours IS NOT NULL AND t.actual_hours > 0 
                    THEN t.actual_hours 
                    ELSE EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) / 3600.0
                END
            ) as avg_time
        FROM users u
        LEFT JOIN tasks t ON t.assignee_id = u.id AND t.status = 'completed'
        WHERE u.is_active = true
        GROUP BY u.id, u.full_name
        HAVING COUNT(t.id) > 0
        ORDER BY completed_tasks DESC
    """)
    
    result = await db.execute(query)
    mechanics_data = []
    
    for row in result:
        # Вычисляем эффективность (условная формула)
        completed_tasks = row.completed_tasks or 0
        avg_time = row.avg_time or 0
        
        # Эффективность: больше задач + меньше времени = выше эффективность
        if avg_time > 0:
            efficiency_score = min(100, (completed_tasks * 10) / avg_time)
        else:
            efficiency_score = completed_tasks * 10
        
        mechanics_data.append({
            "id": row.id,
            "name": row.name or "Без имени",
            "completed_tasks": completed_tasks,
            "avg_time": round(avg_time, 2),
            "efficiency_score": round(efficiency_score, 1)
        })
    
    # Кэшируем на 2 часа
    await set_analytics_cache(cache_key, mechanics_data, 120, db)
    await db.commit()
    
    return [MechanicKPIResponse(**item) for item in mechanics_data]

@router.get("/violations-dynamics", response_model=ViolationDynamicsResponse)
async def get_violations_dynamics(
    days: int = Query(30, ge=7, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить динамику нарушений за период"""
    await require_permission(current_user, "analytics:read", db)
    
    # Проверяем кэш
    cache_key = f"violations_dynamics_{days}"
    cached_data = await get_cached_analytics(cache_key, db)
    if cached_data:
        return ViolationDynamicsResponse(**cached_data)
    
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # Получаем нарушения за период
    viol_result = await db.execute(
        select(Violation).where(
            Violation.created_at >= start_date
        ).order_by(Violation.created_at)
    )
    violations = viol_result.scalars().all()
    
    # Группируем по дням
    periods = []
    current_date = start_date.date()
    
    while current_date <= end_date.date():
        day_violations = [
            v for v in violations 
            if v.created_at.date() == current_date
        ]
        
        severity_breakdown = {
            "low": len([v for v in day_violations if v.severity == "low"]),
            "medium": len([v for v in day_violations if v.severity == "medium"]),
            "high": len([v for v in day_violations if v.severity == "high"]),
            "critical": len([v for v in day_violations if v.severity == "critical"])
        }
        
        periods.append({
            "date": current_date.isoformat(),
            "count": len(day_violations),
            "severity_breakdown": severity_breakdown
        })
        
        current_date += timedelta(days=1)
    
    # Вычисляем тренды
    total_violations = len(violations)
    avg_per_day = total_violations / days if days > 0 else 0
    
    # Тренд за последние 7 дней vs предыдущие 7 дней
    recent_week = [p for p in periods[-7:]]
    prev_week = [p for p in periods[-14:-7]] if len(periods) >= 14 else []
    
    recent_avg = sum(p["count"] for p in recent_week) / 7 if recent_week else 0
    prev_avg = sum(p["count"] for p in prev_week) / 7 if prev_week else 0
    
    trend_direction = "stable"
    if recent_avg > prev_avg * 1.2:
        trend_direction = "increasing"
    elif recent_avg < prev_avg * 0.8:
        trend_direction = "decreasing"
    
    trends = {
        "total_violations": total_violations,
        "avg_per_day": round(avg_per_day, 2),
        "trend_direction": trend_direction,
        "recent_avg": round(recent_avg, 2),
        "prev_avg": round(prev_avg, 2)
    }
    
    response_data = {
        "periods": periods,
        "trends": trends
    }
    
    # Кэшируем на 1 час
    await set_analytics_cache(cache_key, response_data, 60, db)
    await db.commit()
    
    return ViolationDynamicsResponse(**response_data)


