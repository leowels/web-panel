"""
Универсальный клиент для работы с AI провайдерами
Поддерживает OpenAI и Timeweb Cloud AI (включая AI-агентов)
Настройки могут быть в переменных окружения или в базе данных
"""
import os
from typing import Optional
from openai import OpenAI
import httpx

class AIClient:
    """Универсальный клиент для работы с AI"""
    
    def __init__(self, db_settings: Optional[dict] = None):
        """
        Инициализация AI клиента
        
        Args:
            db_settings: Словарь с настройками из базы данных (опционально)
        """
        # Приоритет: настройки из БД > переменные окружения > дефолты
        if db_settings:
            self.provider = db_settings.get("ai_provider", "openai").lower()
            self.api_key = db_settings.get("ai_api_key") or db_settings.get("ai_api_key")
            self.base_url = db_settings.get("ai_base_url")
            self.model = db_settings.get("ai_model", "gpt-3.5-turbo")
            self.agent_access_id = db_settings.get("ai_agent_access_id")  # Для Timeweb Cloud агентов
        else:
            # Fallback на переменные окружения
            self.provider = os.getenv("AI_PROVIDER", "openai").lower()
            self.api_key = os.getenv("AI_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("TIMEWEB_AI_API_KEY")
            self.base_url = os.getenv("AI_BASE_URL")
            self.model = os.getenv("AI_MODEL", "gpt-3.5-turbo")
            self.agent_access_id = os.getenv("TIMEWEB_AGENT_ACCESS_ID")
        
        if not self.api_key:
            raise ValueError("AI_API_KEY не настроен. Настройте через раздел 'Настройки' -> 'AI конфигурация'")
        
        # Настройка для Timeweb Cloud
        # Timeweb Cloud агенты используют OpenAI-совместимый API
        # URL должен быть указан в настройках (из раздела "OpenAI URL" в панели агента)
        if self.provider == "timeweb":
            # Если base_url не указан, пробуем получить из переменных окружения
            if not self.base_url:
                timeweb_url = os.getenv("TIMEWEB_AI_BASE_URL")
                if timeweb_url:
                    self.base_url = timeweb_url
                else:
                    # Дефолтный URL (но лучше указать из настроек агента)
                    self.base_url = "https://api.timeweb.cloud/v1"
            
            # Для Timeweb Cloud всегда используем OpenAI-совместимый API
            self.use_agent_api = False
        
        # Создаем OpenAI-совместимый клиент
        client_kwargs = {
            "api_key": self.api_key,
        }
        
        if self.base_url:
            client_kwargs["base_url"] = self.base_url
        
        self.client = OpenAI(**client_kwargs)
    
    def generate_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: Optional[float] = 0.7,
        parent_message_id: Optional[str] = None
    ) -> str:
        """
        Генерация текста через AI
        
        Args:
            prompt: Пользовательский запрос
            system_prompt: Системный промпт (опционально)
            max_tokens: Максимальное количество токенов
            temperature: Температура генерации (0-1)
            parent_message_id: ID родительского сообщения (не используется для OpenAI-совместимого API)
        
        Returns:
            Сгенерированный текст
        """
        # Все провайдеры используют OpenAI-совместимый API
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": prompt})
        
        try:
            # Для Timeweb Cloud используем прямой HTTP запрос с max_completion_tokens
            if self.provider == "timeweb":
                return self._generate_via_timeweb_http(messages, max_tokens, temperature)
            
            # Для OpenAI и других провайдеров используем стандартный клиент
            model = self.model
            request_params = {
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
            }
            
            # Добавляем temperature только если он указан
            if temperature is not None:
                request_params["temperature"] = temperature
            
            response = self.client.chat.completions.create(**request_params)
            
            return response.choices[0].message.content
        except Exception as e:
            error_msg = str(e)
            # Улучшаем сообщения об ошибках
            if "404" in error_msg or "Not Found" in error_msg:
                raise Exception(
                    f"AI endpoint не найден (404). Проверьте:\n"
                    f"1. Правильность Base URL в настройках (должен быть из раздела 'OpenAI URL' в панели агента)\n"
                    f"2. Правильность API ключа\n"
                    f"3. Что агент активен в панели Timeweb Cloud\n"
                    f"Оригинальная ошибка: {error_msg}"
                )
            if "max_tokens" in error_msg or "max_completion_tokens" in error_msg:
                raise Exception(
                    f"Ошибка параметров запроса: {error_msg}\n"
                    f"Провайдер: {self.provider}\n"
                    f"Попробуйте изменить параметры запроса."
                )
            raise Exception(f"AI generation error: {error_msg}")
    
    def _generate_via_timeweb_http(
        self,
        messages: list,
        max_tokens: int,
        temperature: Optional[float]
    ) -> str:
        """
        Генерация через Timeweb Cloud используя прямой HTTP запрос с max_completion_tokens
        
        Args:
            messages: Список сообщений
            max_tokens: Максимальное количество токенов (будет преобразовано в max_completion_tokens)
            temperature: Температура генерации
        
        Returns:
            Ответ агента
        """
        if not self.base_url:
            raise Exception("Base URL не указан для Timeweb Cloud. Укажите его в настройках AI.")
        
        # Base URL уже содержит полный путь, добавляем только endpoint
        # Формат: https://agent.timeweb.cloud/api/v1/cloud-ai/agents/{agent_id}/v1
        # Нужно добавить /chat/completions
        if self.base_url.endswith('/v1'):
            url = f"{self.base_url}/chat/completions"
        elif '/chat/completions' in self.base_url:
            url = self.base_url
        else:
            # Пробуем добавить /chat/completions
            url = f"{self.base_url.rstrip('/')}/chat/completions"
        
        # Формируем заголовки для Timeweb Cloud API
        # Проверяем, что API ключ не пустой и правильно отформатирован
        if not self.api_key or not self.api_key.strip():
            raise Exception("API ключ не указан или пустой. Проверьте настройки AI.")
        
        # Убираем возможные пробелы и лишние символы
        api_key_clean = self.api_key.strip()
        
        headers = {
            "Authorization": f"Bearer {api_key_clean}",
            "Content-Type": "application/json",
        }
        
        # Формируем payload согласно документации Timeweb Cloud
        # Модель может быть указана в настройках, если нет - не указываем (агент сам знает свою модель)
        payload = {
            "messages": messages,
            "max_completion_tokens": max_tokens,  # Используем max_completion_tokens для Timeweb
        }
        
        # Добавляем модель только если она указана в настройках
        # НО: лучше не указывать модель вообще - агент сам знает свою модель
        # if self.model:
        #     payload["model"] = self.model
        
        # Temperature: некоторые модели (например GPT-5) не поддерживают temperature
        # Пробуем добавить, но если будет ошибка - уберем
        # Для большинства моделей temperature работает, но для некоторых только значение по умолчанию (1)
        # Поэтому не передаем temperature, если модель не поддерживает его
        # Можно попробовать передать только если temperature != 1.0, но лучше не передавать вообще
        # payload["temperature"] = temperature
        
        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
                
                # Извлекаем ответ из структуры OpenAI-совместимого ответа
                if isinstance(data, dict) and "choices" in data:
                    if len(data["choices"]) > 0:
                        choice = data["choices"][0]
                        if "message" in choice:
                            content = choice["message"].get("content")
                            finish_reason = choice.get("finish_reason")
                            
                            # Проверяем, не был ли ответ обрезан
                            if finish_reason == "length":
                                if not content or content.strip() == "":
                                    # Если контент пустой, пробуем увеличить лимит и повторить запрос
                                    if max_tokens < 3000:
                                        # Увеличиваем лимит и повторяем
                                        payload["max_completion_tokens"] = 3000
                                        try:
                                            with httpx.Client(timeout=60.0) as client:
                                                response = client.post(url, json=payload, headers=headers)
                                                response.raise_for_status()
                                                data = response.json()
                                                if isinstance(data, dict) and "choices" in data:
                                                    if len(data["choices"]) > 0:
                                                        choice = data["choices"][0]
                                                        if "message" in choice:
                                                            content = choice["message"].get("content")
                                                            if content:
                                                                return content
                                        except:
                                            pass
                                    raise Exception(
                                        f"Ответ был обрезан из-за лимита токенов (max_completion_tokens={max_tokens}). "
                                        f"Увеличьте значение max_completion_tokens в настройках или увеличьте лимит для запроса."
                                    )
                                # Если есть контент, но он обрезан, просто возвращаем его (без предупреждения)
                                return content
                            
                            if content:
                                return content
                            
                            # Если content пустой, но есть другие поля
                            if "refusal" in choice["message"] and choice["message"]["refusal"]:
                                return f"[Отказ от ответа: {choice['message']['refusal']}]"
                            
                            return "[Пустой ответ от модели]"
                        return str(choice)
                    return str(data["choices"] if data["choices"] else data)
                return str(data)
                
        except httpx.HTTPStatusError as e:
            error_detail = "Unknown error"
            error_data_full = None
            try:
                error_data_full = e.response.json()
                error_detail = (
                    error_data_full.get("error", {}).get("message") or
                    error_data_full.get("detail") or 
                    error_data_full.get("message") or 
                    error_data_full.get("error") or 
                    str(error_data_full)
                )
                
                # Проверяем, не связана ли ошибка с temperature
                if error_data_full.get("details", {}).get("original_message", "").find("temperature") != -1:
                    # Пробуем повторить запрос без temperature
                    payload_without_temp = payload.copy()
                    if "temperature" in payload_without_temp:
                        del payload_without_temp["temperature"]
                    
                    try:
                        with httpx.Client(timeout=60.0) as client:
                            response = client.post(url, json=payload_without_temp, headers=headers)
                            response.raise_for_status()
                            data = response.json()
                            
                            if isinstance(data, dict) and "choices" in data:
                                if len(data["choices"]) > 0 and "message" in data["choices"][0]:
                                    content = data["choices"][0]["message"].get("content")
                                    if content:
                                        return content
                            return str(data["choices"][0] if data["choices"] else data)
                    except:
                        # Если и без temperature не работает, выбрасываем оригинальную ошибку
                        pass
                        
            except:
                error_detail = e.response.text[:500] if hasattr(e.response, 'text') else str(e)
            
            # Добавляем детали для диагностики
            model_info = self.model if self.model else "не указана (используется модель агента)"
            debug_info = f"\nURL: {url}\nModel: {model_info}\nPayload keys: {list(payload.keys())}"
            if error_data_full:
                debug_info += f"\nFull error: {error_data_full}"
            
            raise Exception(
                f"Timeweb Cloud API error ({e.response.status_code}): {error_detail}{debug_info}"
            )
        except Exception as e:
            raise Exception(f"Timeweb Cloud HTTP request error: {str(e)}")
    
    
    def is_configured(self) -> bool:
        """Проверка, настроен ли AI клиент"""
        return bool(self.api_key)

# Глобальный экземпляр клиента
_ai_client: Optional[AIClient] = None
_db_settings_cache: Optional[dict] = None

async def get_ai_settings_from_db(db) -> Optional[dict]:
    """Получить настройки AI из базы данных"""
    try:
        from sqlalchemy import select
        try:
            from backend.models import SystemSettings
        except ImportError:
            from models import SystemSettings
        
        result = await db.execute(
            select(SystemSettings).where(
                SystemSettings.key.in_([
                    "ai_provider",
                    "ai_api_key",
                    "ai_base_url",
                    "ai_model",
                    "ai_agent_access_id"  # Для Timeweb Cloud агентов
                ])
            )
        )
        settings = result.scalars().all()
        
        settings_dict = {}
        for setting in settings:
            settings_dict[setting.key] = setting.value
        
        return settings_dict if settings_dict else None
    except Exception as e:
        print(f"Error loading AI settings from DB: {e}")
        return None

async def get_ai_client_async(db) -> Optional[AIClient]:
    """
    Получить экземпляр AI клиента (асинхронная версия)
    
    Args:
        db: Сессия БД для загрузки настроек
    """
    global _ai_client, _db_settings_cache
    
    # Загружаем настройки из БД
    db_settings = await get_ai_settings_from_db(db)
    if db_settings:
        _db_settings_cache = db_settings
    
    # Если нет настроек в БД, используем кэш или переменные окружения
    if not db_settings:
        db_settings = _db_settings_cache
    
    if _ai_client is None or db_settings:
        try:
            _ai_client = AIClient(db_settings=db_settings)
        except ValueError:
            # AI не настроен
            return None
    
    return _ai_client

def clear_ai_client_cache():
    """Очистить кэш AI клиента (вызывать после обновления настроек)"""
    global _ai_client, _db_settings_cache
    _ai_client = None
    _db_settings_cache = None
