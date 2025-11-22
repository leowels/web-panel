"""
Универсальный AI роутер для генерации текста
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from pydantic import BaseModel
from typing import Optional

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import User, UserActivity
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
    from backend.ai_client import get_ai_client_async
except ImportError:
    from ..models import User, UserActivity
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
                # Формируем контекст из базы знаний (кратко)
                knowledge_context = "\n\nРелевантная документация:\n"
                for item in knowledge_items[:3]:  # Берем только 3 самых релевантных
                    knowledge_context += f"\n[{item.document_type.upper()}] {item.title}"
                    if item.clause_number:
                        knowledge_context += f" - Пункт: {item.clause_number}"
                    # Берем только первые 200 символов для краткости
                    content_preview = item.content[:200] + "..." if len(item.content) > 200 else item.content
                    knowledge_context += f"\n{content_preview}\n"
        except Exception as e:
            # Если не удалось загрузить базу знаний, продолжаем без неё
            import logging
            logging.getLogger(__name__).warning(f"Не удалось загрузить базу знаний: {e}")
        
        # Формируем системный промпт
        system_prompt = "Ты помощник для работы с документами Ростехнадзора. ВАЖНО: Пиши КРАТКО, четко и ясно. Только суть, без лишних слов. Используй документацию только если она релевантна запросу."
        
        # Формируем полный промпт с контекстом из базы знаний
        full_prompt = request.prompt
        if knowledge_context:
            full_prompt = f"{knowledge_context}\n\nЗапрос пользователя: {request.prompt}\n\nВАЖНО: Ответ должен быть КРАТКИМ и четким. Только суть."
        elif request.context:
            full_prompt = f"Контекст: {request.context}\n\nЗапрос: {request.prompt}\n\nВАЖНО: Ответ должен быть КРАТКИМ и четким."
        
        # Устанавливаем разумный лимит токенов
        max_tokens = request.max_tokens or 1500  # Дефолтный лимит 1500
        if knowledge_context:
            max_tokens = max(max_tokens, 2000)  # Минимум 2000 токенов при наличии контекста
        
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

