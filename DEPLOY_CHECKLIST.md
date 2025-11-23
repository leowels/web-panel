# ✅ Чеклист перед деплоем

## 📋 Подготовка

- [x] Dockerfile.frontend создан и настроен
- [x] backend/Dockerfile создан и настроен
- [x] .dockerignore настроен
- [x] next.config.js настроен для standalone
- [x] Все компоненты используют NEXT_PUBLIC_API_URL

---

## 🔧 Backend (FastAPI)

### Файлы:
- [x] `backend/Dockerfile` - готов
- [x] `backend/ENV_BACKEND.txt` - пример переменных создан

### Настройки в Timeweb Cloud:
- [ ] Dockerfile путь: `backend/Dockerfile`
- [ ] Порт: `8000`
- [ ] Переменные окружения заполнены из `backend/ENV_BACKEND.txt`
- [ ] **ВАЖНО:** В `CORS_ORIGINS` указан домен Frontend (после деплоя Frontend)

### После деплоя Backend:
- [ ] Получен URL Backend: `https://backend-xxxxx.twc1.net`
- [ ] Проверен health endpoint: `https://backend-xxxxx.twc1.net/api/health`

---

## 🎨 Frontend (Next.js)

### Файлы:
- [x] `Dockerfile.frontend` - готов
- [x] `ENV_FRONTEND.txt` - пример переменных создан

### Настройки в Timeweb Cloud:
- [ ] Dockerfile путь: `Dockerfile.frontend`
- [ ] Порт: `3000`
- [ ] Переменные окружения заполнены из `ENV_FRONTEND.txt`
- [ ] **ВАЖНО:** `NEXT_PUBLIC_API_URL` = URL Backend (из шага выше)

### После деплоя Frontend:
- [ ] Получен URL Frontend: `https://frontend-xxxxx.twc1.net`
- [ ] Открыта страница входа
- [ ] Проверена авторизация
- [ ] Проверены API запросы к Backend

---

## 🔄 Обновление переменных после деплоя

### 1. После деплоя Backend:
Обновить в Backend:
```env
CORS_ORIGINS=https://frontend-xxxxx.twc1.net
```

### 2. После деплоя Frontend:
Обновить в Frontend:
```env
NEXT_PUBLIC_API_URL=https://backend-xxxxx.twc1.net
BACKEND_URL=https://backend-xxxxx.twc1.net
```

---

## ⚠️ Частые ошибки

1. **CORS ошибки** → Проверить `CORS_ORIGINS` в Backend
2. **API не работает** → Проверить `NEXT_PUBLIC_API_URL` в Frontend
3. **Backend не запускается** → Проверить переменные окружения (особенно `SECRET_KEY`)
4. **Frontend не собирается** → Проверить `NEXT_PUBLIC_API_URL` (должен быть указан при сборке)

---

## 📝 Порядок деплоя

1. ✅ Деплой Backend
2. ✅ Получить URL Backend
3. ✅ Обновить `CORS_ORIGINS` в Backend (добавить URL Frontend)
4. ✅ Деплой Frontend с правильным `NEXT_PUBLIC_API_URL`
5. ✅ Проверка работы

