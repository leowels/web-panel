# 📦 Структура деплоя (отдельные контейнеры)

## 🎯 Общая схема

```
┌─────────────────┐         ┌─────────────────┐
│   Frontend      │ ──────► │    Backend      │
│   (Next.js)     │  API    │   (FastAPI)     │
│   Port: 3000    │         │   Port: 8000    │
└─────────────────┘         └─────────────────┘
                                      │
                                      ▼
                            ┌─────────────────┐
                            │   PostgreSQL    │
                            │   (External)    │
                            └─────────────────┘
```

---

## 📁 Файлы для деплоя

### Backend:
- **Dockerfile:** `backend/Dockerfile`
- **Переменные:** `backend/ENV_BACKEND.txt`

### Frontend:
- **Dockerfile:** `Dockerfile.frontend`
- **Переменные:** `ENV_FRONTEND.txt`

---

## 🔧 Настройка переменных

### Backend (обычные переменные окружения):
- `SECRET_KEY`
- `POSTGRESQL_HOST`, `POSTGRESQL_PORT`, etc.
- `CORS_ORIGINS` ← **ВАЖНО: укажите домен Frontend!**

### Frontend:
- **Build Arguments** (для сборки):
  - `NEXT_PUBLIC_API_URL` ← URL Backend
  - `BACKEND_URL` ← URL Backend
- **Обычные переменные:**
  - `NODE_ENV=production`
  - `PORT=3000`

---

## ⚠️ Критически важно

1. **CORS в Backend** должен разрешать домен Frontend
2. **NEXT_PUBLIC_API_URL** должен быть указан как Build Argument в Frontend
3. **Порядок деплоя:** сначала Backend, потом Frontend

---

## 📚 Документация

- `DEPLOYMENT_GUIDE.md` - полное руководство
- `QUICK_DEPLOY.md` - быстрый старт
- `DEPLOY_CHECKLIST.md` - чеклист


