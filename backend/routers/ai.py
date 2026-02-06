"""
Универсальный AI роутер для генерации текста
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import User, UserActivity, Equipment, Violation, File, KnowledgeBase
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
    from backend.ai_client import get_ai_client_async
except ImportError:
    from ..models import User, UserActivity, Equipment, Violation, File, KnowledgeBase
    from ..database import get_db
    from ..auth import get_current_user, require_permission
    from ..ai_client import get_ai_client_async

router = APIRouter(prefix="/api/ai", tags=["ai"])

class AIGenerateRequest(BaseModel):
    prompt: str
    context: Optional[str] = None
    max_tokens: Optional[int] = 1000
    temperature: Optional[float] = 0.7
    parent_message_id: Optional[str] = None  # Для Timeweb Cloud агентов (контекст чата)

class AIGenerateResponse(BaseModel):
    result: str

class AIClassifyViolationRequest(BaseModel):
    text: str
    photo_ids: Optional[List[int]] = None

class AIClassifyViolationResponse(BaseModel):
    type: str
    severity: str
    gost_reference: Optional[str]
    confidence: float

class AIVoiceToTextRequest(BaseModel):
    audio_file_id: int

class AIVoiceToTextResponse(BaseModel):
    text: str
    checklist_items: Dict[str, Any]
    confidence: float

class AIEquipmentRiskRequest(BaseModel):
    equipment_id: int

class AIEquipmentRiskResponse(BaseModel):
    risk_score: int
    factors: List[str]
    recommendation: str

@router.get("/test")
async def test_ai_connection(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Тестирование подключения к AI"""
    # Проверяем авторизацию пользователя
    if not current_user:
        return {
            "status": "error",
            "message": "Не авторизован. Войдите в систему.",
            "provider": None,
            "configured": False
        }
    
    try:
        # Получаем AI клиент
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            return {
                "status": "error",
                "message": "AI не настроен. Перейдите в раздел 'Настройки' -> 'Системные настройки' и настройте AI провайдера.",
                "provider": None,
                "configured": False
            }
        
        # Пробуем простой запрос
        test_prompt = "Привет! Ответь одним предложением: ты работаешь?"
        
        # Собираем информацию о настройках для диагностики
        config_info = {
            "provider": ai_client.provider,
            "has_api_key": bool(ai_client.api_key),
            "api_key_length": len(ai_client.api_key) if ai_client.api_key else 0,
            "base_url": ai_client.base_url,
        }
        
        # Для Timeweb добавляем информацию об агенте
        if ai_client.provider == "timeweb":
            config_info["has_agent_access_id"] = bool(getattr(ai_client, 'agent_access_id', None))
            config_info["agent_access_id_length"] = len(ai_client.agent_access_id) if getattr(ai_client, 'agent_access_id', None) else 0
            config_info["uses_agent_api"] = getattr(ai_client, 'use_agent_api', False)
        
        try:
            result = ai_client.generate_text(
                prompt=test_prompt,
                system_prompt="Ты помощник. Отвечай кратко и по делу.",
                max_tokens=200,  # Увеличили лимит для теста
                temperature=0.7
            )
            
            return {
                "status": "success",
                "message": "AI успешно подключен и работает!",
                "provider": ai_client.provider,
                "test_response": result[:100] if result else "Нет ответа",
                "configured": True,
                "config_info": config_info
            }
        except Exception as e:
            error_msg = str(e)
            # Разбиваем длинные сообщения на строки для лучшей читаемости
            if "\n" in error_msg:
                error_msg = error_msg.split("\n")
            
            return {
                "status": "error",
                "message": f"Ошибка при тестировании AI: {error_msg[0] if isinstance(error_msg, list) else error_msg}",
                "provider": ai_client.provider,
                "configured": True,
                "error": error_msg,
                "config_info": config_info,
                "details": error_msg if isinstance(error_msg, list) else None
            }
    
    except Exception as e:
        return {
            "status": "error",
            "message": f"Ошибка инициализации AI: {str(e)}",
            "provider": None,
            "configured": False,
            "error": str(e)
        }

@router.post("/generate", response_model=AIGenerateResponse)
async def generate_text(
    request: AIGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Универсальная генерация текста через AI"""
    # Проверяем права (любой авторизованный пользователь может использовать AI)
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    try:
        # Получаем AI клиент
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            raise HTTPException(
                status_code=400,
                detail="AI не настроен. Перейдите в раздел 'Настройки' -> 'Системные настройки' и настройте AI провайдера."
            )
        
        # Получаем релевантную информацию из базы знаний
        knowledge_context = ""
        try:
            try:
                from backend.models import KnowledgeBase
            except ImportError:
                from ..models import KnowledgeBase
            
            # Ищем релевантные документы в базе знаний
            query = select(KnowledgeBase).limit(10)
            if request.context:
                # Поиск по контексту
                query = query.where(
                    or_(
                        KnowledgeBase.title.ilike(f"%{request.context}%"),
                        KnowledgeBase.content.ilike(f"%{request.context}%"),
                        KnowledgeBase.section.ilike(f"%{request.context}%")
                    )
                )
            
            result = await db.execute(query)
            knowledge_items = result.scalars().all()
            
            if knowledge_items:
                # Формируем контекст из базы знаний (расширенный для лучшего понимания)
                knowledge_context = "\n\n=== РЕЛЕВАНТНАЯ ДОКУМЕНТАЦИЯ ИЗ БАЗЫ ЗНАНИЙ ===\n"
                
                # Функция для умного извлечения релевантных частей
                def extract_relevant_content(content: str, search_context: str, max_length: int = 8000) -> str:
                    """Извлекает релевантные части документа"""
                    if not search_context or not search_context.strip():
                        return content[:max_length] + ("..." if len(content) > max_length else "")
                    
                    # Простой поиск по ключевым словам из контекста
                    keywords = [w.lower() for w in search_context.split() if len(w) > 3]
                    if not keywords:
                        return content[:max_length] + ("..." if len(content) > max_length else "")
                    
                    content_lower = content.lower()
                    relevant_parts = []
                    
                    for keyword in keywords[:5]:  # Берем до 5 ключевых слов
                        pos = content_lower.find(keyword)
                        if pos != -1:
                            start = max(0, pos - 1500)
                            end = min(len(content), pos + len(keyword) + 1500)
                            relevant_parts.append((start, end))
                    
                    if relevant_parts:
                        relevant_parts.sort()
                        # Объединяем части
                        result = content[relevant_parts[0][0]:relevant_parts[-1][1]]
                        if len(result) > max_length:
                            result = result[:max_length] + "\n[Документ продолжается]"
                        return result
                    else:
                        return content[:max_length] + ("..." if len(content) > max_length else "")
                
                # Увеличиваем количество документов для лучшего понимания контекста
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
                            request.context or "",
                            max_length=8000
                        )
                    else:
                        content_preview = extract_relevant_content(
                            item.content,
                            request.context or "",
                            max_length=4000
                        )
                    
                    knowledge_context += f"{content_preview}\n\n"
        except Exception as e:
            # Если не удалось загрузить базу знаний, продолжаем без неё
            import logging
            logging.getLogger(__name__).warning(f"Не удалось загрузить базу знаний: {e}")
        
        # Формируем системный промпт
        system_prompt = "Ты помощник для работы с документами инспекции. ВАЖНО: Пиши КРАТКО, четко и ясно. Только суть, без лишних слов. Используй документацию только если она релевантна запросу."
        
        # Формируем полный промпт с контекстом из базы знаний
        full_prompt = request.prompt
        if knowledge_context:
            full_prompt = f"{knowledge_context}\n\nЗапрос пользователя: {request.prompt}\n\nВАЖНО: Ответ должен быть КРАТКИМ и четким. Только суть."
        elif request.context:
            full_prompt = f"Контекст: {request.context}\n\nЗапрос: {request.prompt}\n\nВАЖНО: Ответ должен быть КРАТКИМ и четким."
        
        # Устанавливаем разумный лимит токенов
        max_tokens = request.max_tokens or 2000  # Дефолтный лимит 2000
        if knowledge_context:
            max_tokens = max(max_tokens, 4000)  # Минимум 4000 токенов при наличии контекста базы знаний
        
        # Генерируем текст
        result = ai_client.generate_text(
            prompt=full_prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=request.temperature or 0.7,
            parent_message_id=request.parent_message_id
        )
        
        # Логирование
        activity = UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="ai_generation",
            description=f"AI text generation: {request.prompt[:50]}..."
        )
        db.add(activity)
        await db.commit()
        
        return AIGenerateResponse(result=result)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI generation error: {str(e)}"
        )

@router.post("/classify_violation", response_model=AIClassifyViolationResponse)
async def classify_violation(
    request: AIClassifyViolationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Классификация нарушения через AI"""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        # Получаем AI клиент
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            raise HTTPException(
                status_code=400,
                detail="AI не настроен. Перейдите в раздел 'Настройки' -> 'Системные настройки' и настройте AI провайдера."
            )
        
        # Получаем контекст из базы знаний
        knowledge_context = ""
        try:
            # Ищем релевантные документы ФНП и ГОСТ
            query = select(KnowledgeBase).where(
                KnowledgeBase.document_type.in_(["fnp461", "gost"])
            ).limit(5)
            
            result = await db.execute(query)
            knowledge_items = result.scalars().all()
            
            if knowledge_items:
                knowledge_context = "\n\n=== БАЗА ЗНАНИЙ ===\n"
                for item in knowledge_items:
                    knowledge_context += f"\n[{item.document_type.upper()}] {item.title}\n"
                    if item.clause_number:
                        knowledge_context += f"Пункт: {item.clause_number}\n"
                    knowledge_context += f"{item.content[:1000]}...\n"
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Не удалось загрузить базу знаний: {e}")
        
        # Анализируем фотографии если есть
        photo_context = ""
        if request.photo_ids:
            try:
                photos_result = await db.execute(
                    select(File).where(File.id.in_(request.photo_ids))
                )
                photos = photos_result.scalars().all()
                
                if photos:
                    photo_context = f"\n\nПрикреплено фотографий: {len(photos)}\n"
                    for photo in photos:
                        photo_context += f"- {photo.original_filename} ({photo.file_type})\n"
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Ошибка загрузки фотографий: {e}")
        
        prompt = f"""Проанализируй описание нарушения и классифицируй его.

ОПИСАНИЕ НАРУШЕНИЯ: {request.text}

{photo_context}

{knowledge_context}

ЗАДАЧА:
1. Определи тип нарушения (краткое название)
2. Определи критичность: low, medium, high, critical
3. Найди соответствующий пункт ГОСТ (если применимо)
4. Оцени уверенность в классификации (0.0-1.0)

ФОРМАТ ОТВЕТА:
ТИП: [краткое название типа нарушения]
КРИТИЧНОСТЬ: [low/medium/high/critical]
ГОСТ: [номер ГОСТ или "не применимо"]
УВЕРЕННОСТЬ: [0.0-1.0]

Требования:
- Тип должен быть кратким и понятным
- Критичность основывай на потенциальной опасности
- ГОСТ указывай только если уверен в соответствии
- Уверенность отражает качество анализа"""
        
        system_prompt = "Ты эксперт по промышленной безопасности и классификации нарушений. Анализируй нарушения точно и профессионально."
        
        # Генерируем классификацию
        ai_response = ai_client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=1000,
            temperature=0.3  # Низкая температура для более точной классификации
        )
        
        # Парсим ответ
        violation_type = "Неклассифицированное нарушение"
        severity = "medium"
        gost_reference = None
        confidence = 0.5
        
        try:
            lines = ai_response.split('\n')
            for line in lines:
                line = line.strip()
                if line.startswith('ТИП:'):
                    violation_type = line.split(':', 1)[1].strip()
                elif line.startswith('КРИТИЧНОСТЬ:'):
                    severity_text = line.split(':', 1)[1].strip().lower()
                    if severity_text in ["low", "medium", "high", "critical"]:
                        severity = severity_text
                elif line.startswith('ГОСТ:'):
                    gost_text = line.split(':', 1)[1].strip()
                    if gost_text.lower() not in ['не применимо', 'н/д', 'н/а']:
                        gost_reference = gost_text
                elif line.startswith('УВЕРЕННОСТЬ:'):
                    conf_text = line.split(':', 1)[1].strip()
                    try:
                        confidence = float(conf_text)
                        confidence = max(0.0, min(1.0, confidence))  # Ограничиваем 0-1
                    except ValueError:
                        pass
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Ошибка парсинга ответа AI: {e}")
        
        # Логирование
        activity = UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="ai_classification",
            description=f"AI classified violation: {violation_type}"
        )
        db.add(activity)
        await db.commit()
        
        return AIClassifyViolationResponse(
            type=violation_type,
            severity=severity,
            gost_reference=gost_reference,
            confidence=confidence
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI classification error: {str(e)}"
        )

@router.post("/voice_to_text", response_model=AIVoiceToTextResponse)
async def voice_to_text(
    request: AIVoiceToTextRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Распознавание речи в текст (заглушка - требует интеграции с речевыми API)"""
    # Получаем файл
    file_result = await db.execute(
        select(File).where(File.id == request.audio_file_id)
    )
    audio_file = file_result.scalar_one_or_none()
    
    if not audio_file:
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    # Проверяем тип файла
    if not audio_file.mime_type or not audio_file.mime_type.startswith('audio/'):
        raise HTTPException(status_code=400, detail="File is not an audio file")
    
    # ЗАГЛУШКА: В реальной системе здесь была бы интеграция с API распознавания речи
    # Например, Google Speech-to-Text, Azure Speech Services, или Yandex SpeechKit
    
    # Имитируем результат распознавания
    mock_text = "Кран номер один исправен тормоза работают проверка завершена без замечаний"
    
    # Имитируем извлечение пунктов чек-листа
    mock_checklist = {
        "equipment_status": "исправен",
        "brakes_status": "работают", 
        "inspection_result": "без замечаний",
        "extracted_items": [
            {"item": "Состояние крана", "value": "исправен"},
            {"item": "Работа тормозов", "value": "работают"},
            {"item": "Общий результат", "value": "без замечаний"}
        ]
    }
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="ai_voice_recognition",
        description=f"AI voice recognition for file: {audio_file.original_filename}"
    )
    db.add(activity)
    await db.commit()
    
    return AIVoiceToTextResponse(
        text=mock_text,
        checklist_items=mock_checklist,
        confidence=0.85
    )

@router.get("/equipment/{equipment_id}/risk", response_model=AIEquipmentRiskResponse)
async def get_equipment_ai_risk(
    equipment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """AI-оценка рисков оборудования"""
    # Получаем оборудование
    eq_result = await db.execute(
        select(Equipment).where(Equipment.id == equipment_id)
    )
    equipment = eq_result.scalar_one_or_none()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    try:
        # Получаем AI клиент
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            raise HTTPException(
                status_code=400,
                detail="AI не настроен. Перейдите в раздел 'Настройки' -> 'Системные настройки' и настройте AI провайдера."
            )
        
        # Получаем нарушения для оборудования
        violations_result = await db.execute(
            select(Violation).where(Violation.equipment_id == equipment_id)
        )
        violations = violations_result.scalars().all()
        
        # Формируем данные для анализа
        equipment_data = f"""
ОБОРУДОВАНИЕ:
- Тип: {equipment.equipment_type}
- Паспорт: {equipment.passport_number}
- Дата установки: {equipment.installation_date.strftime('%d.%m.%Y') if equipment.installation_date else 'Не указана'}
- Дата ПТО: {equipment.pto_date.strftime('%d.%m.%Y') if equipment.pto_date else 'Не указана'}
- Дата ЧТО: {equipment.cto_date.strftime('%d.%m.%Y') if equipment.cto_date else 'Не указана'}
- Статус: {equipment.status}
- Грузоподъемность: {equipment.load_capacity or 'Не указана'}
- Место установки: {equipment.installation_location or 'Не указано'}

НАРУШЕНИЯ ({len(violations)} шт.):"""
        
        for violation in violations[:10]:  # Берем последние 10 нарушений
            equipment_data += f"""
- {violation.severity.upper()}: {violation.description[:100]}{'...' if len(violation.description) > 100 else ''}
  Статус: {violation.status}, Дата: {violation.created_at.strftime('%d.%m.%Y')}"""
        
        prompt = f"""{equipment_data}

ЗАДАЧА: Проанализируй состояние оборудования и оцени риски.

Учитывай:
1. Возраст оборудования
2. Просрочки ПТО/ЧТО
3. Количество и критичность нарушений
4. Тип оборудования и его назначение
5. Текущий статус

ФОРМАТ ОТВЕТА:
РИСК: [0-100]
ФАКТОРЫ: [список основных факторов риска через запятую]
РЕКОМЕНДАЦИЯ: [конкретные рекомендации по снижению рисков]

Требования:
- Риск от 0 (минимальный) до 100 (критический)
- Факторы должны быть конкретными и обоснованными
- Рекомендации должны быть практичными и выполнимыми"""
        
        system_prompt = "Ты эксперт по промышленной безопасности и оценке рисков подъемных сооружений. Анализируй риски профессионально и объективно."
        
        # Генерируем оценку
        ai_response = ai_client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=1500,
            temperature=0.4
        )
        
        # Парсим ответ
        risk_score = 50  # По умолчанию средний риск
        factors = ["Требуется дополнительный анализ"]
        recommendation = "Провести детальную проверку оборудования"
        
        try:
            lines = ai_response.split('\n')
            for line in lines:
                line = line.strip()
                if line.startswith('РИСК:'):
                    risk_text = line.split(':', 1)[1].strip()
                    try:
                        risk_score = int(risk_text)
                        risk_score = max(0, min(100, risk_score))
                    except ValueError:
                        pass
                elif line.startswith('ФАКТОРЫ:'):
                    factors_text = line.split(':', 1)[1].strip()
                    if factors_text:
                        factors = [f.strip() for f in factors_text.split(',') if f.strip()]
                elif line.startswith('РЕКОМЕНДАЦИЯ:'):
                    recommendation = line.split(':', 1)[1].strip()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Ошибка парсинга ответа AI: {e}")
        
        # Логирование
        activity = UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="ai_risk_assessment",
            description=f"AI risk assessment for equipment {equipment.passport_number}: {risk_score}%"
        )
        db.add(activity)
        await db.commit()
        
        return AIEquipmentRiskResponse(
            risk_score=risk_score,
            factors=factors,
            recommendation=recommendation
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI risk assessment error: {str(e)}"
        )
