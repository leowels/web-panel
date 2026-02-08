from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from pydantic import BaseModel
import os
import asyncio
from pathlib import Path

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import (
        Report, Equipment, Violation, Task, User, UserActivity,
        Inspection, Permit, KnowledgeBase
    )
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import (
        Report, Equipment, Violation, Task, User, UserActivity,
        Inspection, Permit, KnowledgeBase
    )
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/reports", tags=["reports"])

class ReportGenerateRequest(BaseModel):
    type: str  # shift_report, violation_summary, equipment_status, task_summary
    title: Optional[str] = None
    equipment_ids: Optional[List[int]] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    file_format: str = "pdf"  # pdf, docx, xlsx
    parameters: Optional[Dict[str, Any]] = None

class ReportAIDraftRequest(BaseModel):
    type: str  # shift_report, violation_summary, equipment_status, task_summary
    equipment_ids: Optional[List[int]] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    parameters: Optional[Dict[str, Any]] = None

class ReportAIDraftResponse(BaseModel):
    content: str

class ReportResponse(BaseModel):
    id: int
    report_type: str
    title: str
    parameters: Dict[str, Any]
    file_path: Optional[str]
    file_format: str
    status: str
    generated_by: int
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]
    
    # Связанные объекты
    generator: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

def _report_to_response(report: Report) -> ReportResponse:
    """Преобразование Report в ReportResponse"""
    generator_data = None
    if hasattr(report, 'generator') and report.generator:
        generator_data = {
            "id": report.generator.id,
            "username": report.generator.username,
            "full_name": report.generator.full_name
        }
    
    return ReportResponse(
        id=report.id,
        report_type=report.report_type,
        title=report.title,
        parameters=report.parameters or {},
        file_path=report.file_path,
        file_format=report.file_format,
        status=report.status,
        generated_by=report.generated_by,
        error_message=report.error_message,
        created_at=report.created_at,
        completed_at=report.completed_at,
        generator=generator_data
    )

async def generate_shift_report_content(
    equipment_ids: List[int],
    date_from: date,
    date_to: date,
    db: AsyncSession
) -> Dict[str, Any]:
    """Генерация содержимого сменного отчета"""
    # Получаем оборудование
    equipment_query = select(Equipment)
    if equipment_ids:
        equipment_query = equipment_query.where(Equipment.id.in_(equipment_ids))
    
    eq_result = await db.execute(equipment_query)
    equipment_list = eq_result.scalars().all()
    
    # Получаем нарушения за период
    violations_result = await db.execute(
        select(Violation)
        .options(selectinload(Violation.equipment))
        .where(
            and_(
                Violation.created_at >= datetime.combine(date_from, datetime.min.time()),
                Violation.created_at <= datetime.combine(date_to, datetime.max.time()),
                Violation.equipment_id.in_(equipment_ids) if equipment_ids else True
            )
        )
    )
    violations = violations_result.scalars().all()
    
    # Получаем задачи за период
    tasks_result = await db.execute(
        select(Task)
        .options(selectinload(Task.equipment), selectinload(Task.assignee))
        .where(
            and_(
                Task.created_at >= datetime.combine(date_from, datetime.min.time()),
                Task.created_at <= datetime.combine(date_to, datetime.max.time()),
                Task.equipment_id.in_(equipment_ids) if equipment_ids else True
            )
        )
    )
    tasks = tasks_result.scalars().all()
    
    # Формируем данные отчета
    report_data = {
        "period": {
            "from": date_from.isoformat(),
            "to": date_to.isoformat()
        },
        "equipment": [
            {
                "id": eq.id,
                "type": eq.equipment_type,
                "passport": eq.passport_number,
                "position": eq.position,
                "workshop": eq.workshop,
                "status": eq.status
            }
            for eq in equipment_list
        ],
        "violations": [
            {
                "id": v.id,
                "equipment_passport": v.equipment.passport_number if v.equipment else "Н/Д",
                "description": v.description,
                "severity": v.severity,
                "status": v.status,
                "created_at": v.created_at.isoformat()
            }
            for v in violations
        ],
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "equipment_passport": t.equipment.passport_number if t.equipment else "Н/Д",
                "assignee": t.assignee.full_name if t.assignee else "Не назначен",
                "status": t.status,
                "priority": t.priority
            }
            for t in tasks
        ],
        "summary": {
            "total_equipment": len(equipment_list),
            "total_violations": len(violations),
            "critical_violations": len([v for v in violations if v.severity == "critical"]),
            "open_violations": len([v for v in violations if v.status == "open"]),
            "total_tasks": len(tasks),
            "completed_tasks": len([t for t in tasks if t.status == "completed"]),
            "overdue_tasks": len([t for t in tasks if t.due_date and t.due_date < datetime.utcnow() and t.status != "completed"])
        }
    }
    
    return report_data

async def generate_equipment_status_report(
    equipment_ids: List[int],
    db: AsyncSession
) -> Dict[str, Any]:
    """Генерация отчета о состоянии оборудования"""
    # Получаем оборудование
    equipment_query = select(Equipment)
    if equipment_ids:
        equipment_query = equipment_query.where(Equipment.id.in_(equipment_ids))
    
    eq_result = await db.execute(equipment_query)
    equipment_list = eq_result.scalars().all()
    
    report_data = {
        "generated_at": datetime.utcnow().isoformat(),
        "equipment": []
    }
    
    for equipment in equipment_list:
        # Получаем нарушения для каждого оборудования
        violations_result = await db.execute(
            select(Violation).where(
                and_(
                    Violation.equipment_id == equipment.id,
                    Violation.status == "open"
                )
            )
        )
        open_violations = violations_result.scalars().all()
        
        # Получаем задачи
        tasks_result = await db.execute(
            select(Task).where(Task.equipment_id == equipment.id)
        )
        tasks = tasks_result.scalars().all()
        
        # Проверяем просрочки
        now = datetime.utcnow()
        pto_overdue = equipment.pto_date and equipment.pto_date < now
        cto_overdue = equipment.cto_date and equipment.cto_date < now
        
        equipment_data = {
            "id": equipment.id,
            "type": equipment.equipment_type,
            "passport": equipment.passport_number,
            "position": equipment.position,
            "workshop": equipment.workshop,
            "installation_date": equipment.installation_date.isoformat() if equipment.installation_date else None,
            "pto_date": equipment.pto_date.isoformat() if equipment.pto_date else None,
            "cto_date": equipment.cto_date.isoformat() if equipment.cto_date else None,
            "pto_overdue": pto_overdue,
            "cto_overdue": cto_overdue,
            "pto_days_overdue": (now - equipment.pto_date).days if pto_overdue else 0,
            "cto_days_overdue": (now - equipment.cto_date).days if cto_overdue else 0,
            "status": equipment.status,
            "open_violations_count": len(open_violations),
            "critical_violations_count": len([v for v in open_violations if v.severity == "critical"]),
            "pending_tasks_count": len([t for t in tasks if t.status in ["open", "in_work"]]),
            "violations": [
                {
                    "id": v.id,
                    "description": v.description[:100] + "..." if len(v.description) > 100 else v.description,
                    "severity": v.severity,
                    "deadline": v.deadline.isoformat() if v.deadline else None
                }
                for v in open_violations
            ]
        }
        
        report_data["equipment"].append(equipment_data)
    
    # Добавляем сводку
    report_data["summary"] = {
        "total_equipment": len(equipment_list),
        "active_equipment": len([eq for eq in equipment_list if eq.status == "active"]),
        "equipment_with_violations": len([eq for eq in report_data["equipment"] if eq["open_violations_count"] > 0]),
        "equipment_with_overdue_pto": len([eq for eq in report_data["equipment"] if eq["pto_overdue"]]),
        "equipment_with_overdue_cto": len([eq for eq in report_data["equipment"] if eq["cto_overdue"]]),
        "total_open_violations": sum(eq["open_violations_count"] for eq in report_data["equipment"]),
        "total_critical_violations": sum(eq["critical_violations_count"] for eq in report_data["equipment"])
    }
    
    return report_data

async def _build_violation_summary_data(
    equipment_ids: List[int],
    date_from: Optional[date],
    date_to: Optional[date],
    db: AsyncSession
) -> Dict[str, Any]:
    query = select(Violation)
    if equipment_ids:
        query = query.where(Violation.equipment_id.in_(equipment_ids))
    if date_from:
        query = query.where(Violation.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.where(Violation.created_at <= datetime.combine(date_to, datetime.max.time()))
    
    result = await db.execute(query)
    violations = result.scalars().all()
    
    by_severity = {}
    by_status = {}
    by_equipment = {}
    for v in violations:
        by_severity[v.severity] = by_severity.get(v.severity, 0) + 1
        by_status[v.status] = by_status.get(v.status, 0) + 1
        eq_key = str(v.equipment_id or "unknown")
        by_equipment[eq_key] = by_equipment.get(eq_key, 0) + 1
    
    top_equipment = sorted(by_equipment.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return {
        "total_violations": len(violations),
        "by_severity": by_severity,
        "by_status": by_status,
        "top_equipment": [{"equipment_id": k, "count": v} for k, v in top_equipment],
    }

async def _build_task_summary_data(
    equipment_ids: List[int],
    date_from: Optional[date],
    date_to: Optional[date],
    db: AsyncSession
) -> Dict[str, Any]:
    query = select(Task)
    if equipment_ids:
        query = query.where(Task.equipment_id.in_(equipment_ids))
    if date_from:
        query = query.where(Task.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.where(Task.created_at <= datetime.combine(date_to, datetime.max.time()))
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    by_status = {}
    by_priority = {}
    overdue = 0
    now = datetime.utcnow()
    for t in tasks:
        by_status[t.status] = by_status.get(t.status, 0) + 1
        by_priority[t.priority] = by_priority.get(t.priority, 0) + 1
        if t.due_date and t.due_date < now and t.status != "completed":
            overdue += 1
    
    return {
        "total_tasks": len(tasks),
        "by_status": by_status,
        "by_priority": by_priority,
        "overdue_tasks": overdue,
    }

async def _build_report_data_for_ai(
    request: ReportAIDraftRequest,
    db: AsyncSession
) -> Dict[str, Any]:
    equipment_ids = request.equipment_ids or []
    
    if request.type == "shift_report":
        if not request.date_from or not request.date_to:
            raise ValueError("date_from and date_to are required for shift_report")
        report_data = await generate_shift_report_content(
            equipment_ids,
            request.date_from,
            request.date_to,
            db
        )
        return {
            "type": request.type,
            "period": report_data.get("period"),
            "summary": report_data.get("summary"),
        }
    
    if request.type == "equipment_status":
        report_data = await generate_equipment_status_report(
            equipment_ids,
            db
        )
        return {
            "type": request.type,
            "generated_at": report_data.get("generated_at"),
            "summary": report_data.get("summary"),
        }
    
    if request.type == "violation_summary":
        summary = await _build_violation_summary_data(
            equipment_ids,
            request.date_from,
            request.date_to,
            db
        )
        return {
            "type": request.type,
            "period": {
                "from": request.date_from.isoformat() if request.date_from else None,
                "to": request.date_to.isoformat() if request.date_to else None,
            },
            "summary": summary,
        }
    
    if request.type == "task_summary":
        summary = await _build_task_summary_data(
            equipment_ids,
            request.date_from,
            request.date_to,
            db
        )
        return {
            "type": request.type,
            "period": {
                "from": request.date_from.isoformat() if request.date_from else None,
                "to": request.date_to.isoformat() if request.date_to else None,
            },
            "summary": summary,
        }
    
    raise ValueError("Invalid report type")

async def _build_reports_knowledge_context(
    db: AsyncSession,
    query_text: str,
    limit: int = 6,
    max_chars: int = 5000
) -> str:
    if not query_text or not query_text.strip():
        return ""
    
    query = select(KnowledgeBase).where(
        or_(
            KnowledgeBase.title.ilike(f"%{query_text}%"),
            KnowledgeBase.content.ilike(f"%{query_text}%"),
            KnowledgeBase.section.ilike(f"%{query_text}%"),
            KnowledgeBase.clause_number.ilike(f"%{query_text}%")
        )
    ).limit(limit)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    if not items:
        return ""
    
    parts = ["\n\n=== РЕЛЕВАНТНАЯ ДОКУМЕНТАЦИЯ ИЗ БАЗЫ ЗНАНИЙ ===\n"]
    used = 0
    for item in items:
        header = f"[{item.document_type.upper()}] {item.title}"
        meta = []
        if item.section:
            meta.append(f"Раздел: {item.section}")
        if item.clause_number:
            meta.append(f"Пункт: {item.clause_number}")
        meta_text = "\n".join(meta) + "\n" if meta else ""
        snippet = (item.content or "")[:800]
        block = f"{header}\n{meta_text}{snippet}\n\n"
        if used + len(block) > max_chars:
            break
        parts.append(block)
        used += len(block)
    
    return "".join(parts)

async def generate_report_file(report_data: Dict[str, Any], file_format: str, report_type: str, report_id: int) -> str:
    """Генерация файла отчета"""
    # Создаем директорию для отчетов если не существует
    reports_dir = Path("backend/reports")
    reports_dir.mkdir(exist_ok=True)
    
    filename = f"report_{report_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{file_format}"
    file_path = reports_dir / filename
    
    if file_format == "pdf":
        await generate_pdf_report(report_data, file_path, report_type)
    elif file_format == "docx":
        await generate_docx_report(report_data, file_path, report_type)
    elif file_format == "xlsx":
        await generate_xlsx_report(report_data, file_path, report_type)
    else:
        raise ValueError(f"Unsupported file format: {file_format}")
    
    return str(file_path)

async def generate_pdf_report(report_data: Dict[str, Any], file_path: Path, report_type: str):
    """Генерация PDF отчета (заглушка - требует установки reportlab)"""
    # Простая текстовая версия для демонстрации
    import json
    
    content = f"""
ОТЧЕТ: {report_type.upper()}
Сгенерирован: {datetime.utcnow().strftime('%d.%m.%Y %H:%M')}

{json.dumps(report_data, ensure_ascii=False, indent=2)}
"""
    
    # Сохраняем как текстовый файл (в реальной системе здесь был бы PDF)
    with open(file_path.with_suffix('.txt'), 'w', encoding='utf-8') as f:
        f.write(content)
    
    # Переименовываем в .pdf для совместимости
    file_path.with_suffix('.txt').rename(file_path)

async def generate_docx_report(report_data: Dict[str, Any], file_path: Path, report_type: str):
    """Генерация DOCX отчета (заглушка - требует установки python-docx)"""
    import json
    
    content = f"""
ОТЧЕТ: {report_type.upper()}
Сгенерирован: {datetime.utcnow().strftime('%d.%m.%Y %H:%M')}

{json.dumps(report_data, ensure_ascii=False, indent=2)}
"""
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

async def generate_xlsx_report(report_data: Dict[str, Any], file_path: Path, report_type: str):
    """Генерация XLSX отчета (заглушка - требует установки openpyxl)"""
    import json
    
    content = f"""
ОТЧЕТ: {report_type.upper()}
Сгенерирован: {datetime.utcnow().strftime('%d.%m.%Y %H:%M')}

{json.dumps(report_data, ensure_ascii=False, indent=2)}
"""
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

@router.get("", response_model=List[ReportResponse])
async def get_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    report_type: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список отчетов"""
    await require_permission(current_user, "reports:read", db)
    
    query = select(Report).options(selectinload(Report.generator))
    
    if report_type:
        query = query.where(Report.report_type == report_type)
    
    if status:
        query = query.where(Report.status == status)
    
    query = query.order_by(Report.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    reports = result.scalars().all()
    
    return [_report_to_response(report) for report in reports]

@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить отчет по ID"""
    await require_permission(current_user, "reports:read", db)
    
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.generator))
        .where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return _report_to_response(report)

@router.post("/ai-draft", response_model=ReportAIDraftResponse)
async def generate_report_ai_draft(
    request: ReportAIDraftRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Сгенерировать AI-черновик отчета (без сохранения)"""
    await require_permission(current_user, "reports:read", db)
    
    valid_types = ["shift_report", "violation_summary", "equipment_status", "task_summary"]
    if request.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid report type. Must be one of: {valid_types}")
    
    try:
        try:
            from backend.ai_client import get_ai_client_async
        except ImportError:
            from ai_client import get_ai_client_async
        
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            raise HTTPException(
                status_code=400,
                detail="AI не настроен. Перейдите в раздел 'Настройки' -> 'AI конфигурация' и настройте AI провайдера."
            )
        
        report_data = await _build_report_data_for_ai(request, db)
        knowledge_query = f"{request.type} {request.parameters or ''} ПТО ЧТО безопасность нарушения"
        knowledge_context = await _build_reports_knowledge_context(db, knowledge_query)
        
        prompt = f"""Сформируй КРАТКИЙ черновик отчета на основе данных.

Тип отчета: {request.type}
Параметры: {request.parameters or {}}

Данные:
{report_data}
{knowledge_context}

Требования:
- 5-10 коротких абзацев
- Только факты и выводы по данным
- Краткие рекомендации в конце (3-5 пунктов)
- Официальный деловой стиль"""
        
        system_prompt = "Ты помощник для подготовки отчетов. Ответ только на русском. Пиши кратко, структурированно, без воды."
        
        ai_content = ai_client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=1500,
            temperature=0.4
        )
        
        activity = UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="report_ai_draft",
            description=f"AI draft generated for report type: {request.type}"
        )
        db.add(activity)
        await db.commit()
        
        return ReportAIDraftResponse(content=ai_content)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation error: {str(e)}")

@router.post("/generate", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def generate_report(
    request: ReportGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Генерировать новый отчет"""
    await require_permission(current_user, "reports:create", db)
    
    # Валидация типа отчета
    valid_types = ["shift_report", "violation_summary", "equipment_status", "task_summary"]
    if request.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid report type. Must be one of: {valid_types}")
    
    # Валидация формата файла
    valid_formats = ["pdf", "docx", "xlsx"]
    if request.file_format not in valid_formats:
        raise HTTPException(status_code=400, detail=f"Invalid file format. Must be one of: {valid_formats}")
    
    # Создаем запись отчета
    title = request.title or f"{request.type.replace('_', ' ').title()} - {datetime.utcnow().strftime('%d.%m.%Y %H:%M')}"
    
    new_report = Report(
        report_type=request.type,
        title=title,
        parameters=request.dict(),
        file_format=request.file_format,
        status="generating",
        generated_by=current_user.id
    )
    db.add(new_report)
    await db.flush()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="report",
        entity_id=new_report.id,
        description=f"Started generating report: {title}"
    )
    db.add(activity)
    
    await db.commit()
    
    # Запускаем генерацию отчета в фоне
    asyncio.create_task(generate_report_background(new_report.id, request, db))
    
    # Возвращаем созданный отчет
    result = await db.execute(
        select(Report)
        .options(selectinload(Report.generator))
        .where(Report.id == new_report.id)
    )
    created_report = result.scalar_one()
    
    return _report_to_response(created_report)

async def generate_report_background(report_id: int, request: ReportGenerateRequest, db: AsyncSession):
    """Фоновая генерация отчета"""
    try:
        # Получаем отчет
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one()
        
        # Генерируем данные отчета
        if request.type == "shift_report":
            if not request.date_from or not request.date_to:
                raise ValueError("date_from and date_to are required for shift_report")
            
            report_data = await generate_shift_report_content(
                request.equipment_ids or [],
                request.date_from,
                request.date_to,
                db
            )
        elif request.type == "equipment_status":
            report_data = await generate_equipment_status_report(
                request.equipment_ids or [],
                db
            )
        else:
            # Для других типов отчетов - заглушка
            report_data = {
                "type": request.type,
                "message": "Report type not fully implemented yet",
                "parameters": request.dict()
            }
        
        # Генерируем файл
        file_path = await generate_report_file(
            report_data,
            request.file_format,
            request.type,
            report_id
        )
        
        # Обновляем статус отчета
        report.status = "completed"
        report.file_path = file_path
        report.completed_at = datetime.utcnow()
        
        await db.commit()
        
    except Exception as e:
        # Обновляем статус с ошибкой
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one()
        
        report.status = "failed"
        report.error_message = str(e)
        report.completed_at = datetime.utcnow()
        
        await db.commit()

@router.get("/{report_id}/download")
async def download_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Скачать файл отчета"""
    await require_permission(current_user, "reports:read", db)
    
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    if report.status != "completed" or not report.file_path:
        raise HTTPException(status_code=400, detail="Report is not ready for download")
    
    if not os.path.exists(report.file_path):
        raise HTTPException(status_code=404, detail="Report file not found")
    
    filename = f"{report.title.replace(' ', '_')}.{report.file_format}"
    
    return FileResponse(
        path=report.file_path,
        filename=filename,
        media_type="application/octet-stream"
    )

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить отчет"""
    await require_permission(current_user, "reports:delete", db)
    
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Удаляем файл если существует
    if report.file_path and os.path.exists(report.file_path):
        try:
            os.remove(report.file_path)
        except OSError:
            pass  # Игнорируем ошибки удаления файла
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="report",
        entity_id=report.id,
        description=f"Deleted report: {report.title}"
    )
    db.add(activity)
    
    await db.delete(report)
    await db.commit()
    return None


