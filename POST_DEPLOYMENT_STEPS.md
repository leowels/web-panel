# 🚀 Следующие шаги после запуска Docker

## ✅ Next.js запущен!

Теперь нужно:

### 1. Запустить Backend (FastAPI) ⚠️ ВАЖНО!

У вас есть два варианта:

#### Вариант А: Отдельный контейнер для Backend

Создайте второй контейнер в Timeweb Cloud для Backend:

**Dockerfile для Backend** (создайте `backend/Dockerfile`):
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код
COPY . .

# Запуск сервера
CMD ["python", "run.py"]
```

**Переменные окружения для Backend:**
```env
SECRET_KEY=<сгенерируйте_ключ>
DATABASE_URL=postgresql://user:password@host:5432/dbname
CORS_ORIGINS=https://yourdomain.com
ENVIRONMENT=production
PORT=8000
ADMIN_PASSWORD=<сильный_пароль>
```

#### Вариант Б: Один контейнер для Frontend и Backend

Используйте docker-compose или объедините в один Dockerfile.

### 2. Настроить переменные окружения

#### Для Frontend (Next.js):
```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
PORT=3000
NODE_ENV=production
```

#### Для Backend (FastAPI):
```env
SECRET_KEY=<сгенерируйте_ключ>
DATABASE_URL=postgresql://user:password@host:5432/dbname
CORS_ORIGINS=https://yourdomain.com
ENVIRONMENT=production
PORT=8000
ADMIN_PASSWORD=<сильный_пароль>
```

### 3. Настроить базу данных PostgreSQL

**ВАЖНО:** В production используйте PostgreSQL, НЕ SQLite!

1. Создайте базу данных PostgreSQL в Timeweb Cloud
2. Получите строку подключения
3. Добавьте в `DATABASE_URL`

### 4. Генерация SECRET_KEY

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 5. Проверка работы

1. **Frontend:** Откройте `https://yourdomain.com`
2. **Backend:** Проверьте `https://api.yourdomain.com/api/health`
3. **Вход:** Используйте `admin` / пароль из `ADMIN_PASSWORD`

### 6. Проверка функций

- ✅ Вход в систему
- ✅ Дашборд загружается
- ✅ Создание оборудования
- ✅ Создание нарушений
- ✅ AI генерация (если настроена)

## ⚠️ Важно!

1. **Backend должен быть запущен** - без него Frontend не сможет работать
2. **База данных** - используйте PostgreSQL
3. **CORS** - настройте для ваших доменов
4. **HTTPS** - убедитесь, что SSL настроен

---

**Следующий шаг:** Запустите Backend контейнер! 🚀


