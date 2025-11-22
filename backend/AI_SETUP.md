# Настройка AI интеграции

Система поддерживает работу с различными AI провайдерами:
- OpenAI
- Timeweb Cloud AI

## Настройка через переменные окружения

Создайте файл `.env` в папке `backend` или установите переменные окружения:

### Для OpenAI (по умолчанию)

```env
AI_PROVIDER=openai
AI_API_KEY=your-openai-api-key
# или используйте старую переменную
OPENAI_API_KEY=your-openai-api-key
AI_MODEL=gpt-3.5-turbo
```

### Для Timeweb Cloud AI

```env
AI_PROVIDER=timeweb
AI_API_KEY=your-timeweb-api-key
# Endpoint может быть в формате:
# https://api.timeweb.cloud/ai/v1/agents/{agent_id}
# или
# https://api.timeweb.cloud/v1
AI_BASE_URL=https://api.timeweb.cloud/ai/v1/agents/your-agent-id
# или используйте переменную TIMEWEB_AI_BASE_URL
TIMEWEB_AI_BASE_URL=https://api.timeweb.cloud/ai/v1/agents/your-agent-id
AI_MODEL=gpt-3.5-turbo
```

**Как получить данные для Timeweb Cloud:**

1. Зайдите в панель Timeweb Cloud
2. Перейдите в раздел "AI Агенты" или "AI Agents"
3. Выберите созданного агента
4. В настройках агента:
   - Скопируйте **API ключ** (установите тип API как "Публичный")
   - Скопируйте **Endpoint URL** (обычно в формате `https://api.timeweb.cloud/ai/v1/agents/{agent_id}`)
5. Укажите эти значения в `.env` файле

## Где используется AI

1. **Генерация нарушений** (`/api/violations/ai/generate`)
   - Создает описание нарушения на основе оборудования

2. **Генерация актов** (`/api/acts/{id}/generate`)
   - Создает текст предписания на основе нарушений

3. **Поиск в базе знаний** (`/api/knowledge/ai/search`)
   - Контекстный поиск документов ФНП/ГОСТ

## Получение данных для Timeweb Cloud

1. Зайдите в панель Timeweb Cloud
2. Найдите раздел AI/ML или API
3. Скопируйте:
   - API ключ
   - Endpoint URL (обычно что-то вроде `https://api.timeweb.cloud/v1`)

## Пример .env файла

```env
# Database
DATABASE_URL=sqlite+aiosqlite:///./rostekhnadzor.db

# AI Configuration (Timeweb Cloud)
AI_PROVIDER=timeweb
AI_API_KEY=tw_xxxxxxxxxxxxxxxxxxxxx
AI_BASE_URL=https://api.timeweb.cloud/v1
AI_MODEL=gpt-3.5-turbo

# JWT
SECRET_KEY=your-secret-key-change-in-production
```

## Проверка настройки

После настройки перезапустите сервер. AI функции будут автоматически использовать указанный провайдер.

