# ⚡ Быстрый деплой (отдельные контейнеры)

## 📦 Backend (FastAPI)

### Настройки в Timeweb Cloud:
- **Dockerfile:** `backend/Dockerfile`
- **Порт:** 8000
- **Переменные:** см. `backend/ENV_BACKEND.txt`

### После деплоя:
Получите URL Backend → `https://backend-xxxxx.twc1.net`

---

## 🎨 Frontend (Next.js)

### Настройки в Timeweb Cloud:
- **Dockerfile:** `Dockerfile.frontend`
- **Порт:** 3000
- **Переменные окружения:** `NODE_ENV=production`, `PORT=3000`
- **Build Arguments (ВАЖНО!):** 
  ```env
  NEXT_PUBLIC_API_URL=https://backend-xxxxx.twc1.net
  BACKEND_URL=https://backend-xxxxx.twc1.net
  ```

### ⚠️ ВАЖНО:
- `NEXT_PUBLIC_API_URL` и `BACKEND_URL` должны быть указаны как **Build Arguments**, а не обычные переменные окружения
- Замените `https://backend-xxxxx.twc1.net` на реальный URL вашего Backend!

### ⚠️ ВАЖНО для Backend:
В `CORS_ORIGINS` укажите домен Frontend:
```env
CORS_ORIGINS=https://frontend-xxxxx.twc1.net
```

---

## ✅ Порядок действий:

1. Деплой Backend → получить URL
2. Обновить `CORS_ORIGINS` в Backend на URL Frontend
3. Обновить `NEXT_PUBLIC_API_URL` в Frontend на URL Backend
4. Деплой Frontend

---

## 🔍 Проверка:

- Backend: `https://backend-xxxxx.twc1.net/api/health`
- Frontend: `https://frontend-xxxxx.twc1.net`

