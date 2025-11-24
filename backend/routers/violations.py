from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import re
from pydantic import BaseModel
import os

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import Violation, Inspection, Equipment, UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import Violation, Inspection, Equipment, UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/violations", tags=["violations"])

def _equipment_summary(equipment: Optional[Equipment]) -> Optional[EquipmentSummary]:
    if not equipment:
        return None
    return EquipmentSummary(
        id=equipment.id,
        equipment_type=equipment.equipment_type,
        passport_number=equipment.passport_number,
        position=equipment.position,
        inventory_number=equipment.inventory_number,
        workshop=equipment.workshop,
    )


def _violation_to_response(violation: Violation) -> ViolationResponse:
    return ViolationResponse(
        id=violation.id,
        inspection_id=violation.inspection_id,
        equipment_id=violation.equipment_id,
        description=violation.description,
        fnp_clause=violation.fnp_clause,
        gost_clause=violation.gost_clause,
        severity=violation.severity,
        location=violation.location,
        deadline=violation.deadline,
        status=violation.status,
        resolved_at=violation.resolved_at,
        created_at=violation.created_at,
        updated_at=violation.updated_at,
        equipment=_equipment_summary(getattr(violation, "equipment", None)),
    )

class ViolationCreate(BaseModel):
    inspection_id: Optional[int] = None
    equipment_id: int
    description: str
    fnp_clause: Optional[str] = None
    gost_clause: Optional[str] = None
    severity: str = "medium"  # low, medium, high, critical
    location: Optional[str] = None
    deadline: Optional[datetime] = None

class ViolationUpdate(BaseModel):
    description: Optional[str] = None
    fnp_clause: Optional[str] = None
    gost_clause: Optional[str] = None
    severity: Optional[str] = None
    location: Optional[str] = None
    deadline: Optional[datetime] = None
    status: Optional[str] = None

class EquipmentSummary(BaseModel):
    id: int
    equipment_type: str
    passport_number: str
    position: Optional[str]
    inventory_number: Optional[str]
    workshop: Optional[str]

    class Config:
        from_attributes = True

class ViolationResponse(BaseModel):
    id: int
    inspection_id: Optional[int]
    equipment_id: int
    description: str
    fnp_clause: Optional[str]
    gost_clause: Optional[str]
    severity: str
    location: Optional[str]
    deadline: Optional[datetime]
    status: str
    resolved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    equipment: Optional[EquipmentSummary] = None

    class Config:
        from_attributes = True

class AIGenerateViolationResponse(BaseModel):
    """Ответ с информацией о сгенерированном нарушении и использованных документах"""
    violation: ViolationResponse
    used_documents: List[dict] = []  # Список документов из базы знаний, которые были использованы

class AIGenerateViolationRequest(BaseModel):
    inspection_id: Optional[int] = None
    equipment_id: int
    violation_type: str  # Тип нарушения (краткое описание от пользователя)
    context: Optional[str] = None

class ViolationBulkCreate(BaseModel):
    equipment_ids: List[int]
    description: str
    inspection_id: Optional[int] = None
    fnp_clause: Optional[str] = None
    gost_clause: Optional[str] = None
    severity: str = "medium"
    location: Optional[str] = None
    deadline: Optional[datetime] = None

class ViolationBulkResponse(BaseModel):
    created: int
    skipped: int
    created_ids: List[int]
    errors: List[dict]

@router.get("", response_model=List[ViolationResponse])
async def get_violations(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    equipment_id: Optional[int] = None,
    inspection_id: Optional[int] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список нарушений"""
    await require_permission(current_user, "violations:read", db)
    
    query = select(Violation).options(selectinload(Violation.equipment))
    
    if equipment_id:
        query = query.where(Violation.equipment_id == equipment_id)
    
    if inspection_id:
        query = query.where(Violation.inspection_id == inspection_id)
    
    if status:
        query = query.where(Violation.status == status)
    
    if severity:
        query = query.where(Violation.severity == severity)
    
    query = query.order_by(Violation.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    violations = result.scalars().all()
    
    return [_violation_to_response(v) for v in violations]

@router.get("/{violation_id}", response_model=ViolationResponse)
async def get_violation(
    violation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить нарушение по ID"""
    await require_permission(current_user, "violations:read", db)
    
    result = await db.execute(
        select(Violation)
        .options(selectinload(Violation.equipment))
        .where(Violation.id == violation_id)
    )
    violation = result.scalar_one_or_none()
    
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    
    return _violation_to_response(violation)

@router.post("", response_model=ViolationResponse, status_code=status.HTTP_201_CREATED)
async def create_violation(
    violation_data: ViolationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новое нарушение"""
    await require_permission(current_user, "violations:create", db)
    
    # Проверка существования оборудования
    eq_result = await db.execute(select(Equipment).where(Equipment.id == violation_data.equipment_id))
    equipment = eq_result.scalar_one_or_none()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    new_violation = Violation(
        inspection_id=violation_data.inspection_id,
        equipment_id=violation_data.equipment_id,
        description=violation_data.description,
        fnp_clause=violation_data.fnp_clause,
        gost_clause=violation_data.gost_clause,
        severity=violation_data.severity,
        location=violation_data.location,
        deadline=violation_data.deadline,
        status="open",
        created_by=current_user.id
    )
    db.add(new_violation)
    await db.flush()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="violation",
        entity_id=new_violation.id,
        description=f"Created violation for equipment {violation_data.equipment_id}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(new_violation)
    new_violation.equipment = equipment
    
    return _violation_to_response(new_violation)


@router.post("/bulk", response_model=ViolationBulkResponse)
async def bulk_create_violations(
    payload: ViolationBulkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Массовое создание нарушений для нескольких ПС"""
    await require_permission(current_user, "violations:create", db)

    if not payload.equipment_ids:
        raise HTTPException(status_code=400, detail="Equipment IDs are required")

    created_ids: List[int] = []
    errors: List[dict] = []

    for eq_id in payload.equipment_ids:
        eq_result = await db.execute(select(Equipment).where(Equipment.id == eq_id))
        equipment = eq_result.scalar_one_or_none()
        if not equipment:
            errors.append(
                {
                    "equipment_id": eq_id,
                    "detail": "Equipment not found",
                }
            )
            continue

        try:
            new_violation = Violation(
                inspection_id=payload.inspection_id,
                equipment_id=eq_id,
                description=payload.description,
                fnp_clause=payload.fnp_clause,
                gost_clause=payload.gost_clause,
                severity=payload.severity,
                location=payload.location,
                deadline=payload.deadline,
                status="open",
                created_by=current_user.id
            )
            db.add(new_violation)
            await db.flush()
            created_ids.append(new_violation.id)

            activity = UserActivity(
                user_id=current_user.id,
                action_type="create",
                entity_type="violation",
                entity_id=new_violation.id,
                description=f"Bulk created violation for equipment {eq_id}"
            )
            db.add(activity)
        except Exception as exc:
            errors.append(
                {
                    "equipment_id": eq_id,
                    "detail": str(exc),
                }
            )

    await db.commit()

    return ViolationBulkResponse(
        created=len(created_ids),
        skipped=len(payload.equipment_ids) - len(created_ids),
        created_ids=created_ids,
        errors=errors,
    )

@router.post("/ai/generate", response_model=ViolationResponse)
async def generate_violation_ai(
    request: AIGenerateViolationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Генерация нарушения через ИИ"""
    await require_permission(current_user, "violations:create", db)
    
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Используем универсальный AI клиент
        try:
            from backend.ai_client import get_ai_client_async
        except ImportError:
            from ai_client import get_ai_client_async
        
        # Загружаем настройки из БД
        logger.info(f"Загрузка AI клиента для пользователя {current_user.id}")
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            logger.error("AI клиент не настроен")
            raise HTTPException(
                status_code=400, 
                detail="AI не настроен. Перейдите в раздел 'Настройки' -> 'Системные настройки' и настройте AI провайдера."
            )
        
        logger.info(f"AI клиент загружен, провайдер: {ai_client.provider}")
        
        # Получение информации об оборудовании
        eq_result = await db.execute(select(Equipment).where(Equipment.id == request.equipment_id))
        equipment = eq_result.scalar_one_or_none()
        if not equipment:
            logger.error(f"Оборудование с ID {request.equipment_id} не найдено")
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        logger.info(f"Генерация нарушения для оборудования {equipment.id}")
        
        # Получаем релевантную информацию из базы знаний
        knowledge_context = ""
        used_documents = []  # Список использованных документов для ответа
        try:
            try:
                from backend.models import KnowledgeBase
            except ImportError:
                from ..models import KnowledgeBase
            
            # ПРИОРИТЕТ: Сначала ищем документы ФНП 461 и ГОСТ
            # Ищем по типу нарушения и типу оборудования
            search_terms = [
                request.violation_type.lower(),  # Тип нарушения от пользователя
                equipment.equipment_type.lower(),
                request.context.lower() if request.context else ""
            ]
            
            # Сначала ищем ФНП 461 и ГОСТ документы
            fnp_gost_query = select(KnowledgeBase).where(
                KnowledgeBase.document_type.in_(["fnp461", "gost"])
            ).limit(10)
            
            # Добавляем условия поиска по содержимому
            fnp_conditions = []
            for term in search_terms:
                if term and term.strip():
                    fnp_conditions.append(
                        or_(
                            KnowledgeBase.title.ilike(f"%{term}%"),
                            KnowledgeBase.content.ilike(f"%{term}%"),
                            KnowledgeBase.section.ilike(f"%{term}%"),
                            KnowledgeBase.clause_number.ilike(f"%{term}%")
                        )
                    )
            
            if fnp_conditions:
                fnp_gost_query = fnp_gost_query.where(or_(*fnp_conditions))
            
            result = await db.execute(fnp_gost_query)
            knowledge_items = result.scalars().all()
            
            # Если не нашли ФНП/ГОСТ, ищем любые документы
            if not knowledge_items:
                logger.info("ФНП/ГОСТ документы не найдены, ищем любые документы")
                general_query = select(KnowledgeBase).limit(10)
                general_conditions = []
                for term in search_terms:
                    if term and term.strip():
                        general_conditions.append(
                            or_(
                                KnowledgeBase.title.ilike(f"%{term}%"),
                                KnowledgeBase.content.ilike(f"%{term}%"),
                                KnowledgeBase.section.ilike(f"%{term}%")
                            )
                        )
                if general_conditions:
                    general_query = general_query.where(or_(*general_conditions))
                result = await db.execute(general_query)
                knowledge_items = result.scalars().all()
            
            if knowledge_items:
                knowledge_context = "\n\n=== РЕЛЕВАНТНАЯ ДОКУМЕНТАЦИЯ ИЗ БАЗЫ ЗНАНИЙ ===\n"
                logger.info(f"Найдено {len(knowledge_items)} документов в базе знаний")
                for item in knowledge_items[:5]:  # Берем до 5 документов
                    doc_type_name = {
                        "fnp461": "ФНП 461",
                        "gost": "ГОСТ",
                        "manual": "Методичка"
                    }.get(item.document_type, item.document_type.upper())
                    
                    knowledge_context += f"\n[{doc_type_name}] {item.title}"
                    if item.section:
                        knowledge_context += f" - Раздел: {item.section}"
                    if item.clause_number:
                        knowledge_context += f" - Пункт: {item.clause_number}"
                    # Берем больше контекста для ФНП/ГОСТ
                    preview_length = 500 if item.document_type in ["fnp461", "gost"] else 300
                    content_preview = item.content[:preview_length] + "..." if len(item.content) > preview_length else item.content
                    knowledge_context += f"\n{content_preview}\n"
                    
                    # Сохраняем информацию о документе для ответа
                    used_documents.append({
                        "id": item.id,
                        "document_type": item.document_type,
                        "title": item.title,
                        "section": item.section,
                        "clause_number": item.clause_number,
                        "content_preview": content_preview[:200] + "..." if len(content_preview) > 200 else content_preview
                    })
                    
                    logger.info(f"Добавлен документ в контекст: {doc_type_name} - {item.title} (ID: {item.id})")
            else:
                logger.warning("База знаний пуста или не содержит релевантных документов. ИИ будет генерировать пункты ФНП без контекста.")
                knowledge_context = "\n\n⚠️ ВНИМАНИЕ: База знаний не содержит документов ФНП 461 или ГОСТ. Используй только РЕАЛЬНЫЕ пункты, которые ты знаешь. Если не уверен - укажи 'не применимо'.\n"
        except Exception as e:
            logger.warning(f"Не удалось загрузить базу знаний: {e}")
            knowledge_context = "\n\n⚠️ Ошибка загрузки базы знаний. Используй только РЕАЛЬНЫЕ пункты ФНП 461/ГОСТ.\n"
        
        prompt = f"""Оформи официальное нарушение для подъемного сооружения на основе типа нарушения.

ТИП НАРУШЕНИЯ (от инспектора): {request.violation_type}

ДАННЫЕ ОБОРУДОВАНИЯ:
- Тип ПС: {equipment.equipment_type}
- Паспорт: {equipment.passport_number}
- Место установки: {equipment.installation_location or 'Не указано'}
- Контекст: {request.context or 'Не указано'}

{knowledge_context}

ЗАДАЧА:
1. Создай ОФИЦИАЛЬНОЕ, ДОКУМЕНТАЛЬНОЕ описание нарушения в официальном стиле инспекции (2-4 предложения)
2. Определи и укажи конкретный пункт ФНП 461, который нарушен (формат: "п. 123 ФНП 461" или "п.п. 123-125 ФНП 461")
3. Определи и укажи ГОСТ, если применимо (формат: "ГОСТ 12345-2020" или "ГОСТ 12345")
4. Определи срок устранения на основе критичности (формат: количество дней, например "30" для средних нарушений)

ФОРМАТ ОТВЕТА (строго соблюдай структуру):
ОПИСАНИЕ: [официальное описание нарушения 2-4 предложения]
ФНП: [пункт ФНП 461, например "п. 123 ФНП 461" или "не применимо"]
ГОСТ: [номер ГОСТ, например "ГОСТ 12345-2020" или "не применимо"]
СРОК_ДНЕЙ: [количество дней для устранения, например "30"]

Требования:
- Описание должно быть ОФИЦИАЛЬНЫМ и ДОКУМЕНТАЛЬНЫМ
- Используй официальную терминологию инспекции
- Пункты ФНП/ГОСТ должны быть РЕАЛЬНЫМИ и РЕЛЕВАНТНЫМИ
- Срок устранения: критичные - 7 дней, высокие - 15 дней, средние - 30 дней, низкие - 60 дней"""
        
        system_prompt = "Ты помощник для создания официальных нарушений в системе инспекции. Твоя задача - оформить тип нарушения в официальный документ с указанием пунктов ФНП 461, ГОСТ и срока устранения. Отвечай строго в указанном формате."
        
        # Логируем контекст, который был передан ИИ
        logger.info("=" * 80)
        logger.info("=== КОНТЕКСТ ДЛЯ ИИ ===")
        logger.info(f"Тип нарушения: {request.violation_type}")
        logger.info(f"Оборудование: {equipment.equipment_type} (ID: {equipment.id})")
        logger.info(f"Найдено документов в базе знаний: {len(used_documents)}")
        if used_documents:
            logger.info("Использованные документы:")
            for doc in used_documents:
                logger.info(f"  - {doc['document_type']}: {doc['title']} (пункт: {doc.get('clause_number', 'н/д')})")
        else:
            logger.warning("⚠️ Документы в базе знаний НЕ НАЙДЕНЫ!")
        logger.info(f"Длина контекста базы знаний: {len(knowledge_context)} символов")
        logger.info("=" * 80)
        
        logger.info("Отправка запроса к AI для генерации нарушения")
        try:
            # Для Timeweb Cloud не передаем temperature (некоторые модели не поддерживают)
            # Для других провайдеров используем стандартное значение
            temperature = None if ai_client.provider == "timeweb" else 0.7
            
            ai_description = ai_client.generate_text(
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=2000,  # Увеличенный лимит для генерации нарушений с контекстом
                temperature=temperature
            )
            logger.info(f"AI вернул ответ длиной {len(ai_description) if ai_description else 0} символов")
        except Exception as ai_error:
            logger.error(f"Ошибка при генерации через AI: {str(ai_error)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Ошибка генерации через AI: {str(ai_error)}"
            )
        
        # Проверяем, что AI вернул описание
        if not ai_description or not ai_description.strip():
            logger.error("AI вернул пустое описание")
            raise HTTPException(
                status_code=500,
                detail="AI вернул пустое описание нарушения. Попробуйте еще раз или увеличьте лимит токенов."
            )
        
        # Логируем контекст, который был передан ИИ
        logger.info(f"=== КОНТЕКСТ ДЛЯ ИИ ===")
        logger.info(f"Тип нарушения: {request.violation_type}")
        logger.info(f"Оборудование: {equipment.equipment_type} (ID: {equipment.id})")
        logger.info(f"Найдено документов в базе знаний: {len(used_documents)}")
        if used_documents:
            logger.info("Использованные документы:")
            for doc in used_documents:
                logger.info(f"  - {doc['document_type']}: {doc['title']} (пункт: {doc.get('clause_number', 'н/д')})")
        else:
            logger.warning("⚠️ Документы в базе знаний НЕ НАЙДЕНЫ!")
        logger.info(f"Длина контекста базы знаний: {len(knowledge_context)} символов")
        logger.info("=== КОНЕЦ КОНТЕКСТА ===")
        
        logger.info("Парсинг ответа AI")
        
        # Парсим ответ AI для извлечения описания, пунктов ФНП/ГОСТ и срока
        description = ai_description.strip()
        fnp_clause = None
        gost_clause = None
        deadline_days = 30  # По умолчанию 30 дней
        severity = "medium"  # По умолчанию средняя критичность
        
        # Пытаемся извлечь структурированные данные из ответа
        try:
            lines = ai_description.split('\n')
            for i, line in enumerate(lines):
                line = line.strip()
                if line.startswith('ОПИСАНИЕ:') or line.startswith('ОПИСАНИЕ'):
                    # Берем описание до следующего заголовка
                    desc_lines = []
                    for j in range(i + 1, len(lines)):
                        if lines[j].strip().startswith(('ФНП:', 'ГОСТ:', 'СРОК_ДНЕЙ:', 'ФНП', 'ГОСТ', 'СРОК_ДНЕЙ')):
                            break
                        if lines[j].strip():
                            desc_lines.append(lines[j].strip())
                    if desc_lines:
                        description = ' '.join(desc_lines)
                elif line.startswith('ФНП:') or line.startswith('ФНП'):
                    fnp_text = line.split(':', 1)[-1].strip() if ':' in line else line.replace('ФНП', '').strip()
                    if fnp_text and fnp_text.lower() not in ['не применимо', 'не применим', 'н/д', 'н/а']:
                        fnp_clause = fnp_text
                elif line.startswith('ГОСТ:') or line.startswith('ГОСТ'):
                    gost_text = line.split(':', 1)[-1].strip() if ':' in line else line.replace('ГОСТ', '').strip()
                    if gost_text and gost_text.lower() not in ['не применимо', 'не применим', 'н/д', 'н/а']:
                        gost_clause = gost_text
                elif line.startswith('СРОК_ДНЕЙ:') or line.startswith('СРОК_ДНЕЙ') or 'СРОК' in line.upper():
                    days_text = line.split(':', 1)[-1].strip() if ':' in line else line
                    # Извлекаем число из строки
                    days_match = re.search(r'\d+', days_text)
                    if days_match:
                        deadline_days = int(days_match.group())
                        # Определяем критичность на основе срока
                        if deadline_days <= 7:
                            severity = "critical"
                        elif deadline_days <= 15:
                            severity = "high"
                        elif deadline_days <= 30:
                            severity = "medium"
                        else:
                            severity = "low"
        except Exception as parse_error:
            logger.warning(f"Ошибка парсинга ответа AI: {parse_error}. Используем весь ответ как описание.")
            # Если не удалось распарсить, используем весь ответ как описание
        
        # Вычисляем дату дедлайна
        deadline = datetime.utcnow() + timedelta(days=deadline_days) if deadline_days > 0 else None
        
        logger.info(f"Извлечено: описание={len(description)} символов, ФНП={fnp_clause}, ГОСТ={gost_clause}, срок={deadline_days} дней, критичность={severity}")
        logger.info("Создание нарушения в базе данных")
        
        # Создание нарушения
        new_violation = Violation(
            inspection_id=request.inspection_id,
            equipment_id=request.equipment_id,
            description=description,
            fnp_clause=fnp_clause,
            gost_clause=gost_clause,
            severity=severity,
            deadline=deadline,
            status="open",
            created_by=current_user.id
        )
        db.add(new_violation)
        await db.flush()
        
        logger.info(f"Нарушение создано с ID {new_violation.id}")
        
        # Логирование
        activity = UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="violation",
            entity_id=new_violation.id,
            description=f"AI-generated violation for equipment {request.equipment_id}"
        )
        db.add(activity)
        
        await db.commit()
        await db.refresh(new_violation)
        new_violation.equipment = equipment
        
        logger.info(f"Нарушение успешно сохранено, возвращаем ответ")
        
        violation_response = _violation_to_response(new_violation)
        
        response = AIGenerateViolationResponse(
            violation=violation_response,
            used_documents=used_documents
        )
        
        logger.info(f"Возвращаем ответ с нарушением ID {new_violation.id}, использовано документов: {len(used_documents)}")
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Неожиданная ошибка при генерации нарушения: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка генерации нарушения: {str(e)}")

@router.put("/{violation_id}", response_model=ViolationResponse)
async def update_violation(
    violation_id: int,
    violation_data: ViolationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить нарушение"""
    await require_permission(current_user, "violations:update", db)
    
    result = await db.execute(select(Violation).where(Violation.id == violation_id))
    violation = result.scalar_one_or_none()
    
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    
    update_data = violation_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(violation, field, value)
    
    if violation_data.status == "resolved" and not violation.resolved_at:
        violation.resolved_at = datetime.utcnow()
        violation.resolved_by = current_user.id
    
    violation.updated_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="violation",
        entity_id=violation.id,
        description=f"Updated violation {violation.id}"
    )
    db.add(activity)
    
    await db.commit()
    result = await db.execute(
        select(Violation)
        .options(selectinload(Violation.equipment))
        .where(Violation.id == violation.id)
    )
    updated_violation = result.scalar_one()
    
    return _violation_to_response(updated_violation)

@router.delete("/{violation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_violation(
    violation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить нарушение"""
    await require_permission(current_user, "violations:delete", db)
    
    result = await db.execute(select(Violation).where(Violation.id == violation_id))
    violation = result.scalar_one_or_none()
    
    if not violation:
        raise HTTPException(status_code=404, detail="Violation not found")
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="violation",
        entity_id=violation.id,
        description=f"Deleted violation {violation.id}"
    )
    db.add(activity)
    
    await db.delete(violation)
    await db.commit()
    return None

