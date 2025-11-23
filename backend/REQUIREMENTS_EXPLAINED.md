# 📚 Python библиотеки для Backend

## Основные зависимости

### 1. FastAPI и сервер
- **fastapi==0.104.1** - Основной фреймворк для API
- **uvicorn[standard]==0.24.0** - ASGI сервер для запуска FastAPI

### 2. Аутентификация и безопасность
- **python-jose[cryptography]==3.3.0** - JWT токены для аутентификации
- **passlib[bcrypt]==1.7.4** - Хеширование паролей
- **python-multipart==0.0.6** - Обработка multipart/form-data (загрузка файлов)

### 3. База данных
- **sqlalchemy==2.0.23** - ORM для работы с БД
- **aiosqlite==0.19.0** - Асинхронный драйвер для SQLite (для разработки)
- **alembic==1.12.1** - Миграции базы данных

### 4. Валидация данных
- **pydantic==2.5.2** - Валидация и сериализация данных
- **pydantic[email]==2.5.2** - Валидация email адресов
- **pydantic-settings==2.1.0** - Управление настройками через переменные окружения

### 5. Утилиты
- **python-dotenv==1.0.0** - Загрузка переменных из .env файла
- **httpx==0.25.2** - HTTP клиент для запросов к внешним API (AI)

### 6. AI интеграция
- **openai==1.3.7** - OpenAI API клиент

### 7. Работа с файлами
- **pillow==10.1.0** - Обработка изображений
- **aiofiles==23.2.1** - Асинхронная работа с файлами
- **python-docx==1.1.0** - Работа с DOCX документами
- **PyPDF2==3.0.1** - Работа с PDF файлами
- **pdfplumber==0.10.3** - Извлечение текста из PDF
- **reportlab==4.0.7** - Генерация PDF документов

### 8. Валидация
- **email-validator==2.1.0** - Валидация email адресов

## Установка

```bash
cd backend
pip install -r requirements.txt
```

## Для production

В production используйте PostgreSQL вместо SQLite. Для этого добавьте:

```txt
psycopg2-binary==2.9.9  # или asyncpg для асинхронной работы
```

И измените `DATABASE_URL`:
```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

## Минимальные требования

Если нужно установить только самое необходимое:

```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
sqlalchemy==2.0.23
pydantic==2.5.2
python-dotenv==1.0.0
```

Но для полной функциональности нужны все библиотеки из requirements.txt.


