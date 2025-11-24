# Настройка AI на локалке (локальный компьютер)

## Способ 1: Через файл .env (рекомендуется)

### Шаги:

1. **Создайте файл `.env` в папке `backend/`**

   Если файла нет, создайте его:
   ```bash
   cd backend
   # Windows
   type nul > .env
   # Linux/Mac
   touch .env
   ```

2. **Добавьте в файл `.env` следующие переменные:**

   ```bash
   # AI Configuration для Timeweb Cloud
   AI_PROVIDER=timeweb
   AI_API_KEY=ваш_api_ключ_из_панели_timeweb
   AI_BASE_URL=https://agent.timeweb.cloud/api/v1/cloud-ai/agents/5678b8cd-4bea-412f-81ca-62e92a38aa49/v1
   AI_MODEL=gpt-3.5-turbo
   ```

   **Или для OpenAI:**
   ```bash
   # AI Configuration для OpenAI
   AI_PROVIDER=openai
   AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
   AI_MODEL=gpt-3.5-turbo
   # AI_BASE_URL не нужен для OpenAI
   ```

3. **Где взять данные для Timeweb Cloud:**

   - **AI_API_KEY**: Откройте панель управления вашим AI-агентом в Timeweb Cloud → скопируйте **API ключ**
   - **AI_BASE_URL**: В той же панели найдите раздел **"OpenAI URL"** → скопируйте полный URL (должен заканчиваться на `/v1`)

4. **Перезапустите backend**

   ```bash
   # Остановите текущий процесс (Ctrl+C)
   # Затем запустите снова
   python run.py
   # или
   python main.py
   ```

## Способ 2: Через веб-интерфейс (альтернатива)

1. Запустите приложение (frontend + backend)
2. Войдите как администратор
3. Перейдите в **Настройки** → **Системные настройки**
4. Найдите раздел **AI Конфигурация**
5. Заполните:
   - **AI Провайдер**: `timeweb` (или `openai`)
   - **AI API Ключ**: ваш ключ
   - **AI Base URL**: URL из панели Timeweb Cloud
   - **AI Модель**: `gpt-3.5-turbo` (опционально)
6. Сохраните каждое поле
7. Нажмите **"Тестировать AI"**

## Пример полного .env файла для локалки

```bash
# Database
DATABASE_URL=sqlite+aiosqlite:///./inspectorhub.db

# JWT Secret Key
SECRET_KEY=ваш-секретный-ключ-для-jwt

# AI Configuration (Timeweb Cloud)
AI_PROVIDER=timeweb
AI_API_KEY=tw_xxxxxxxxxxxxxxxxxxxxx
AI_BASE_URL=https://agent.timeweb.cloud/api/v1/cloud-ai/agents/5678b8cd-4bea-412f-81ca-62e92a38aa49/v1
AI_MODEL=gpt-3.5-turbo

# Или для OpenAI
# AI_PROVIDER=openai
# AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
# AI_MODEL=gpt-3.5-turbo
```

## Проверка работы

После настройки:
1. Запустите backend: `python run.py`
2. В логах не должно быть ошибок про AI_API_KEY
3. Откройте веб-интерфейс
4. Попробуйте использовать AI функции (генерация текста, создание актов, нарушений)

## Отличие от сервера

**На локалке:**
- ✅ Настройки в файле `backend/.env`
- ✅ Проще редактировать
- ✅ Не нужно перезапускать контейнер

**На сервере:**
- ✅ Настройки через веб-интерфейс (сохраняются в БД)
- ✅ Или через переменные окружения Docker/системы
- ✅ Нужно перезапускать контейнер/сервис

## Важно!

- Файл `.env` **НЕ должен** попадать в Git (должен быть в `.gitignore`)
- На сервере используйте веб-интерфейс или переменные окружения
- После изменения `.env` всегда перезапускайте backend


