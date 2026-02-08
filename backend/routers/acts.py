from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import os
import csv
import io

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import Act, ActViolation, Violation, Equipment, Inspection, UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import Act, ActViolation, Violation, Equipment, Inspection, UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/acts", tags=["acts"])

class ActCreate(BaseModel):
    equipment_id: Optional[int] = None
    inspection_id: Optional[int] = None
    organization: str
    violation_ids: List[int] = []

class ActUpdate(BaseModel):
    act_number: Optional[str] = None
    act_date: Optional[datetime] = None
    organization: Optional[str] = None
    status: Optional[str] = None
    content: Optional[str] = None
    inspector_signature: Optional[str] = None
    organization_signature: Optional[str] = None

class ActResponse(BaseModel):
    id: int
    act_number: str
    act_date: datetime
    organization: str
    equipment_id: Optional[int]
    inspection_id: Optional[int]
    status: str
    inspector_signature: Optional[str]
    organization_signature: Optional[str]
    content: Optional[str]
    created_at: datetime
    updated_at: datetime
    violation_ids: List[int] = []

    class Config:
        from_attributes = True

class ActDraftResponse(BaseModel):
    content: str

async def _generate_act_ai_content(act: Act, db: AsyncSession) -> str:
    """Generate act content via AI without persisting."""
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
    
    violations_result = await db.execute(
        select(Violation).where(Violation.id.in_([av.violation_id for av in act.violations]))
    )
    violations = violations_result.scalars().all()
    
    violations_text = "\n".join([f"- {v.description}" for v in violations])
    
    knowledge_context = ""
    try:
        try:
            from backend.models import KnowledgeBase
        except ImportError:
            from ..models import KnowledgeBase
        
        query = select(KnowledgeBase).where(
            KnowledgeBase.document_type.in_(["fnp461", "gost"])
        ).limit(10)
        
        result = await db.execute(query)
        knowledge_items = result.scalars().all()
        
        if knowledge_items:
            knowledge_context = "\n\n=== РЕЛЕВАНТНАЯ ДОКУМЕНТАЦИЯ ИЗ БАЗЫ ЗНАНИЙ ===\n"
            
            violation_keywords = []
            for v in violations:
                words = v.description.lower().split()
                violation_keywords.extend([w for w in words if len(w) > 4])
            
            def extract_relevant_content(content: str, keywords: list, max_length: int = 8000) -> str:
                if not keywords:
                    return content[:max_length] + ("..." if len(content) > max_length else "")
                
                content_lower = content.lower()
                relevant_parts = []
                
                for keyword in keywords[:10]:
                    pos = content_lower.find(keyword)
                    if pos != -1:
                        start = max(0, pos - 1500)
                        end = min(len(content), pos + len(keyword) + 1500)
                        relevant_parts.append((start, end))
                
                if relevant_parts:
                    relevant_parts.sort()
                    result = content[relevant_parts[0][0]:relevant_parts[-1][1]]
                    if len(result) > max_length:
                        result = result[:max_length] + "\n[Документ продолжается]"
                    return result
                else:
                    return content[:max_length] + ("..." if len(content) > max_length else "")
            
            for item in knowledge_items[:12]:
                doc_type_name = {
                    "fnp461": "ФНП 461",
                    "gost": "ГОСТ",
                    "manual": "Методичка"
                }.get(item.document_type, item.document_type.upper())
                
                knowledge_context += f"\n{'='*50}\n[{doc_type_name}] {item.title}\n{'='*50}\n"
                if item.section:
                    knowledge_context += f"Раздел: {item.section}\n"
                if item.clause_number:
                    knowledge_context += f"Пункт: {item.clause_number}\n"
                knowledge_context += "\n"
                
                if item.document_type in ["fnp461", "gost"]:
                    content_preview = extract_relevant_content(
                        item.content,
                        violation_keywords,
                        max_length=8000
                    )
                else:
                    content_preview = extract_relevant_content(
                        item.content,
                        violation_keywords,
                        max_length=4000
                    )
                
                knowledge_context += f"{content_preview}\n\n"
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Не удалось загрузить базу знаний: {e}")
    
    prompt = f"""Создай КРАТКИЙ и четкий текст предписания (акта) инспекции:

Организация: {act.organization or 'Не указано'}
Номер акта: {act.act_number}
Дата: {act.act_date.strftime('%d.%m.%Y')}

Нарушения:
{violations_text}
{knowledge_context}

Требования:
- Текст должен быть КРАТКИМ и структурированным
- Только суть, без лишних слов
- Официальный стиль инспекции
- Ссылки на ФНП 461/ГОСТ только если релевантны
- Максимум 5-7 абзацев"""
    
    system_prompt = "Ты помощник для создания официальных документов инспекции. Ответ только на русском. Пиши КРАТКО, четко, структурированно. Только суть, без воды. Используй документацию только для релевантных ссылок."
    
    ai_content = ai_client.generate_text(
        prompt=prompt,
        system_prompt=system_prompt,
        max_tokens=4000,
        temperature=0.7
    )
    
    return ai_content

@router.get("", response_model=List[ActResponse])
async def get_acts(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    equipment_id: Optional[int] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список актов"""
    await require_permission(current_user, "acts:read", db)
    
    query = select(Act).options(selectinload(Act.violations))
    
    if equipment_id:
        query = query.where(Act.equipment_id == equipment_id)
    
    if status:
        query = query.where(Act.status == status)
    
    query = query.order_by(Act.act_date.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    acts = result.scalars().all()
    
    return [
        ActResponse(
            id=a.id,
            act_number=a.act_number,
            act_date=a.act_date,
            organization=a.organization,
            equipment_id=a.equipment_id,
            inspection_id=a.inspection_id,
            status=a.status,
            inspector_signature=a.inspector_signature,
            organization_signature=a.organization_signature,
            content=a.content,
            created_at=a.created_at,
            updated_at=a.updated_at,
            violation_ids=[av.violation_id for av in a.violations]
        )
        for a in acts
    ]

@router.get("/{act_id}", response_model=ActResponse)
async def get_act(
    act_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить акт по ID"""
    await require_permission(current_user, "acts:read", db)
    
    result = await db.execute(
        select(Act)
        .options(selectinload(Act.violations))
        .where(Act.id == act_id)
    )
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Act not found")
    
    return ActResponse(
        id=act.id,
        act_number=act.act_number,
        act_date=act.act_date,
        organization=act.organization,
        equipment_id=act.equipment_id,
        inspection_id=act.inspection_id,
        status=act.status,
        inspector_signature=act.inspector_signature,
        organization_signature=act.organization_signature,
        content=act.content,
        created_at=act.created_at,
        updated_at=act.updated_at,
        violation_ids=[av.violation_id for av in act.violations]
    )

@router.post("", response_model=ActResponse, status_code=status.HTTP_201_CREATED)
async def create_act(
    act_data: ActCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новый акт"""
    await require_permission(current_user, "acts:create", db)
    
    # Генерация номера акта
    from datetime import date
    today = date.today()
    year = today.year
    month = today.month
    
    # Поиск последнего номера за этот месяц
    result = await db.execute(
        select(Act).where(Act.act_number.like(f"АКТ-{year}-{month:02d}-%"))
    )
    existing_acts = result.scalars().all()
    next_number = len(existing_acts) + 1
    act_number = f"АКТ-{year}-{month:02d}-{next_number:04d}"
    
    new_act = Act(
        act_number=act_number,
        act_date=datetime.utcnow(),
        organization=act_data.organization,
        equipment_id=act_data.equipment_id,
        inspection_id=act_data.inspection_id,
        status="draft",
        created_by=current_user.id
    )
    db.add(new_act)
    await db.flush()
    
    # Привязка нарушений
    if act_data.violation_ids:
        violations_result = await db.execute(
            select(Violation).where(Violation.id.in_(act_data.violation_ids))
        )
        violations = violations_result.scalars().all()
        
        for violation in violations:
            act_violation = ActViolation(
                act_id=new_act.id,
                violation_id=violation.id
            )
            db.add(act_violation)
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="act",
        entity_id=new_act.id,
        description=f"Created act {act_number}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(new_act)
    
    result = await db.execute(
        select(Act)
        .options(selectinload(Act.violations))
        .where(Act.id == new_act.id)
    )
    act = result.scalar_one()
    
    return ActResponse(
        id=act.id,
        act_number=act.act_number,
        act_date=act.act_date,
        organization=act.organization,
        equipment_id=act.equipment_id,
        inspection_id=act.inspection_id,
        status=act.status,
        inspector_signature=act.inspector_signature,
        organization_signature=act.organization_signature,
        content=act.content,
        created_at=act.created_at,
        updated_at=act.updated_at,
        violation_ids=[av.violation_id for av in act.violations]
    )

@router.post("/{act_id}/generate", response_model=ActResponse)
async def generate_act_content(
    act_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Генерация текста акта через ИИ"""
    await require_permission(current_user, "acts:update", db)
    
    result = await db.execute(
        select(Act)
        .options(selectinload(Act.violations))
        .where(Act.id == act_id)
    )
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Act not found")
    
    try:
        # Используем универсальный AI клиент
        try:
            from backend.ai_client import get_ai_client_async
        except ImportError:
            from ai_client import get_ai_client_async
        
        # Загружаем настройки из БД
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            raise HTTPException(
                status_code=400, 
                detail="AI не настроен. Перейдите в раздел 'Настройки' -> 'AI конфигурация' и настройте AI провайдера."
            )
        
        # Получение информации о нарушениях
        violations_result = await db.execute(
            select(Violation).where(Violation.id.in_([av.violation_id for av in act.violations]))
        )
        violations = violations_result.scalars().all()
        
        violations_text = "\n".join([f"- {v.description}" for v in violations])
        
        # Получаем релевантную информацию из базы знаний
        knowledge_context = ""
        try:
            try:
                from backend.models import KnowledgeBase
            except ImportError:
                from ..models import KnowledgeBase
            
            # Ищем релевантные документы
            query = select(KnowledgeBase).where(
                KnowledgeBase.document_type.in_(["fnp461", "gost"])
            ).limit(10)
            
            result = await db.execute(query)
            knowledge_items = result.scalars().all()
            
            if knowledge_items:
                knowledge_context = "\n\n=== РЕЛЕВАНТНАЯ ДОКУМЕНТАЦИЯ ИЗ БАЗЫ ЗНАНИЙ ===\n"
                
                # Извлекаем ключевые слова из нарушений для поиска релевантных частей
                violation_keywords = []
                for v in violations:
                    # Извлекаем ключевые слова из описания нарушения
                    words = v.description.lower().split()
                    violation_keywords.extend([w for w in words if len(w) > 4])
                
                # Функция для умного извлечения релевантных частей
                def extract_relevant_content(content: str, keywords: list, max_length: int = 8000) -> str:
                    """Извлекает релевантные части документа вокруг ключевых слов"""
                    if not keywords:
                        return content[:max_length] + ("..." if len(content) > max_length else "")
                    
                    content_lower = content.lower()
                    relevant_parts = []
                    
                    for keyword in keywords[:10]:  # Берем до 10 ключевых слов
                        pos = content_lower.find(keyword)
                        if pos != -1:
                            start = max(0, pos - 1500)
                            end = min(len(content), pos + len(keyword) + 1500)
                            relevant_parts.append((start, end))
                    
                    if relevant_parts:
                        relevant_parts.sort()
                        result = content[relevant_parts[0][0]:relevant_parts[-1][1]]
                        if len(result) > max_length:
                            result = result[:max_length] + "\n[Документ продолжается]"
                        return result
                    else:
                        return content[:max_length] + ("..." if len(content) > max_length else "")
                
                # Увеличиваем количество документов для лучшего понимания
                for item in knowledge_items[:12]:  # Берем до 12 документов
                    doc_type_name = {
                        "fnp461": "ФНП 461",
                        "gost": "ГОСТ",
                        "manual": "Методичка"
                    }.get(item.document_type, item.document_type.upper())
                    
                    knowledge_context += f"\n{'='*50}\n[{doc_type_name}] {item.title}\n{'='*50}\n"
                    if item.section:
                        knowledge_context += f"Раздел: {item.section}\n"
                    if item.clause_number:
                        knowledge_context += f"Пункт: {item.clause_number}\n"
                    knowledge_context += "\n"
                    
                    # Умное извлечение контента:
                    # - ФНП/ГОСТ: до 8000 символов релевантных частей
                    # - Остальные: до 4000 символов
                    if item.document_type in ["fnp461", "gost"]:
                        content_preview = extract_relevant_content(
                            item.content,
                            violation_keywords,
                            max_length=8000
                        )
                    else:
                        content_preview = extract_relevant_content(
                            item.content,
                            violation_keywords,
                            max_length=4000
                        )
                    
                    knowledge_context += f"{content_preview}\n\n"
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Не удалось загрузить базу знаний: {e}")
        
        prompt = f"""Создай КРАТКИЙ и четкий текст предписания (акта) инспекции:

Организация: {act.organization or 'Не указано'}
Номер акта: {act.act_number}
Дата: {act.act_date.strftime('%d.%m.%Y')}

Нарушения:
{violations_text}
{knowledge_context}

Требования:
- Текст должен быть КРАТКИМ и структурированным
- Только суть, без лишних слов
- Официальный стиль инспекции
- Ссылки на ФНП 461/ГОСТ только если релевантны
- Максимум 5-7 абзацев"""
        
        system_prompt = "Ты помощник для создания официальных документов инспекции. Ответ только на русском. Пиши КРАТКО, четко, структурированно. Только суть, без воды. Используй документацию только для релевантных ссылок."
        
        ai_content = ai_client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=4000,  # Увеличенный лимит для генерации актов с расширенным контекстом
            temperature=0.7
        )
        
        act.content = ai_content
        act.updated_at = datetime.utcnow()
        
        # Логирование
        activity = UserActivity(
            user_id=current_user.id,
            action_type="update",
            entity_type="act",
            entity_id=act.id,
            description=f"AI-generated content for act {act.act_number}"
        )
        db.add(activity)
        
        await db.commit()
        await db.refresh(act)
        
        result = await db.execute(
            select(Act)
            .options(selectinload(Act.violations))
            .where(Act.id == act.id)
        )
        updated_act = result.scalar_one()
        
        return ActResponse(
            id=updated_act.id,
            act_number=updated_act.act_number,
            act_date=updated_act.act_date,
            organization=updated_act.organization,
            equipment_id=updated_act.equipment_id,
            inspection_id=updated_act.inspection_id,
            status=updated_act.status,
            inspector_signature=updated_act.inspector_signature,
            organization_signature=updated_act.organization_signature,
            content=updated_act.content,
            created_at=updated_act.created_at,
            updated_at=updated_act.updated_at,
            violation_ids=[av.violation_id for av in updated_act.violations]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation error: {str(e)}")

@router.post("/{act_id}/generate-draft", response_model=ActDraftResponse)
async def generate_act_draft(
    act_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Сгенерировать черновик текста акта через ИИ (без сохранения)"""
    await require_permission(current_user, "acts:update", db)
    
    result = await db.execute(
        select(Act)
        .options(selectinload(Act.violations))
        .where(Act.id == act_id)
    )
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Act not found")
    
    try:
        ai_content = await _generate_act_ai_content(act, db)
        return ActDraftResponse(content=ai_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation error: {str(e)}")

@router.put("/{act_id}", response_model=ActResponse)
async def update_act(
    act_id: int,
    act_data: ActUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить акт"""
    await require_permission(current_user, "acts:update", db)
    
    result = await db.execute(
        select(Act)
        .options(selectinload(Act.violations))
        .where(Act.id == act_id)
    )
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Act not found")
    
    update_data = act_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(act, field, value)
    
    act.updated_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="act",
        entity_id=act.id,
        description=f"Updated act {act.act_number}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(act)
    
    result = await db.execute(
        select(Act)
        .options(selectinload(Act.violations))
        .where(Act.id == act.id)
    )
    updated_act = result.scalar_one()
    
    return ActResponse(
        id=updated_act.id,
        act_number=updated_act.act_number,
        act_date=updated_act.act_date,
        organization=updated_act.organization,
        equipment_id=updated_act.equipment_id,
        inspection_id=updated_act.inspection_id,
        status=updated_act.status,
        inspector_signature=updated_act.inspector_signature,
        organization_signature=updated_act.organization_signature,
        content=updated_act.content,
        created_at=updated_act.created_at,
        updated_at=updated_act.updated_at,
        violation_ids=[av.violation_id for av in updated_act.violations]
    )

@router.get("/{act_id}/export/table")
async def export_act_table(
    act_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Экспорт предписания в таблицу (CSV/Excel) с нарушениями"""
    await require_permission(current_user, "acts:read", db)
    
    # Получаем акт с нарушениями
    result = await db.execute(
        select(Act)
        .options(selectinload(Act.violations).selectinload(ActViolation.violation))
        .where(Act.id == act_id)
    )
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Act not found")
    
    # Получаем все нарушения акта
    violations_result = await db.execute(
        select(Violation)
        .join(ActViolation, Violation.id == ActViolation.violation_id)
        .where(ActViolation.act_id == act_id)
    )
    violations = violations_result.scalars().all()
    
    # Создаем CSV в памяти
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)
    
    # Заголовки таблицы
    writer.writerow(['Нарушение', 'Пункт нарушения (ФНП/ГОСТ)', 'Дата устранения'])
    
    # Заполняем данные
    for violation in violations:
        # Описание нарушения
        description = violation.description or ''
        
        # Пункт нарушения (ФНП или ГОСТ)
        clause = ''
        if violation.fnp_clause:
            clause = f"ФНП 461: {violation.fnp_clause}"
        elif violation.gost_clause:
            clause = f"ГОСТ: {violation.gost_clause}"
        else:
            clause = 'Не указано'
        
        # Дата устранения
        deadline = ''
        if violation.deadline:
            deadline = violation.deadline.strftime('%d.%m.%Y')
        else:
            deadline = 'Не указано'
        
        writer.writerow([description, clause, deadline])
    
    # Получаем CSV строку
    csv_content = output.getvalue()
    output.close()
    
    # Формируем имя файла (используем только ASCII для избежания проблем с кодировкой заголовков)
    safe_act_number = act.act_number.replace('/', '_').replace('\\', '_').replace(' ', '_')
    # Удаляем все не-ASCII символы из номера акта для имени файла
    safe_act_number = ''.join(c if ord(c) < 128 else '_' for c in safe_act_number)
    filename = f"Predpisanie_{safe_act_number}.csv"
    
    # Кодируем в UTF-8 с BOM для корректного отображения в Excel
    csv_bytes = csv_content.encode('utf-8-sig')
    
    # Создаем генератор для StreamingResponse (избегаем проблем с кодировкой заголовков)
    def generate():
        yield csv_bytes
    
    # Возвращаем CSV файл через StreamingResponse с ASCII именем файла
    # (содержимое файла будет в UTF-8, что обеспечит корректное отображение кириллицы)
    return StreamingResponse(
        generate(),
        media_type='text/csv; charset=utf-8-sig',
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"'
        }
    )

@router.post("/{act_id}/export/pdf")
async def export_act_pdf(
    act_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Экспорт акта в PDF"""
    await require_permission(current_user, "acts:read", db)
    
    result = await db.execute(
        select(Act)
        .options(selectinload(Act.violations))
        .where(Act.id == act_id)
    )
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Act not found")
    
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import mm
        import io
        
        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        
        # Заголовок
        p.setFont("Helvetica-Bold", 16)
        p.drawString(50*mm, height - 50*mm, "ПРЕДПИСАНИЕ")
        
        # Номер и дата
        p.setFont("Helvetica", 12)
        p.drawString(50*mm, height - 70*mm, f"№ {act.act_number}")
        p.drawString(50*mm, height - 85*mm, f"от {act.act_date.strftime('%d.%m.%Y')}")
        
        # Организация
        p.drawString(50*mm, height - 100*mm, f"Организация: {act.organization}")
        
        # Содержание
        if act.content:
            p.setFont("Helvetica", 10)
            y = height - 130*mm
            for line in act.content.split('\n'):
                if y < 50*mm:
                    p.showPage()
                    y = height - 50*mm
                p.drawString(50*mm, y, line[:80])
                y -= 15
        
        p.save()
        buffer.seek(0)
        
        from fastapi.responses import Response
        return Response(
            content=buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=act_{act.act_number}.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation error: {str(e)}")

@router.delete("/{act_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_act(
    act_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить акт"""
    await require_permission(current_user, "acts:delete", db)
    
    result = await db.execute(select(Act).where(Act.id == act_id))
    act = result.scalar_one_or_none()
    
    if not act:
        raise HTTPException(status_code=404, detail="Act not found")
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="act",
        entity_id=act.id,
        description=f"Deleted act {act.act_number}"
    )
    db.add(activity)
    
    await db.delete(act)
    await db.commit()
    return None
