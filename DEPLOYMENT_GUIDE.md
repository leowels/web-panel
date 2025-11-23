# 🚀 Руководство по деплою (отдельные контейнеры)

## 📋 Структура деплоя

- **Frontend** - Next.js на порту 3000
- **Backend** - FastAPI на порту 8000
- **База данных** - PostgreSQL (внешняя)

---

## 🎯 Шаг 1: Деплой Backend

### 1.1. Создайте приложение Backend

- **Тип:** Docker контейнер
- **Dockerfile:** `backend/Dockerfile`
- **Порт:** 8000
- **Рабочая директория:** корень репозитория (для правильного копирования `backend/`)

### 1.2. Переменные окружения Backend:

```env
SECRET_KEY=8E7ExQa6dqn-yERIMMHbA_IzLdvTJ6Vw1mLSslMoBp0

POSTGRESQL_HOST=be96b16b290a1cfbdf0595d0.twc1.net
POSTGRESQL_PORT=5432
POSTGRESQL_USER=gen_user
POSTGRESQL_PASSWORD=ваш_пароль_от_бд
POSTGRESQL_DBNAME=default_db

PORT=8000
ENVIRONMENT=production
ADMIN_PASSWORD=ваш_сильный_пароль
CORS_ORIGINS=https://frontend-domain.com,http://localhost:3000
```

**Важно:** В `CORS_ORIGINS` укажите реальный домен Frontend!

### 1.3. После деплоя Backend

Получите URL Backend (например: `https://backend-xxxxx.twc1.net`)

---

## 🎯 Шаг 2: Деплой Frontend

### 2.1. Создайте приложение Frontend

- **Тип:** Docker контейнер
- **Dockerfile:** `Dockerfile.frontend`
- **Порт:** 3000
- **Рабочая директория:** корень репозитория

### 2.2. Переменные окружения Frontend:

**Обычные переменные:**
```env
NODE_ENV=production
PORT=3000
```

**Build Arguments (ВАЖНО!):**
В Timeweb Cloud при создании приложения укажите Build Arguments:
```env
NEXT_PUBLIC_API_URL=https://backend-xxxxx.twc1.net
BACKEND_URL=https://backend-xxxxx.twc1.net
```

**Важно:** 
- `NEXT_PUBLIC_API_URL` и `BACKEND_URL` должны быть переданы как **Build Arguments**, так как они нужны во время сборки Next.js
- Замените `https://backend-xxxxx.twc1.net` на реальный URL вашего Backend!

---

## ✅ Проверка работы

### Backend:
- `https://backend-xxxxx.twc1.net/api/health` → `{"status": "ok"}`

### Frontend:
- `https://frontend-xxxxx.twc1.net` → страница входа

---

## 🔧 Настройка CORS

В Backend переменной `CORS_ORIGINS` должен быть указан домен Frontend:

```env
CORS_ORIGINS=https://frontend-xxxxx.twc1.net,http://localhost:3000
```

---

## 📝 Порядок деплоя

1. **Сначала** задеплойте Backend
2. **Получите** URL Backend
3. **Обновите** `NEXT_PUBLIC_API_URL` в Frontend на URL Backend
4. **Задеплойте** Frontend

---

## ⚠️ Важно

- Backend должен быть доступен по HTTPS
- Frontend должен знать точный URL Backend
- CORS должен быть настроен правильно в Backend

