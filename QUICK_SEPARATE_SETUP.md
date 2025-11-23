# ⚡ Быстрая настройка отдельных контейнеров

## 📋 Шаг 1: Создайте Backend приложение

1. В Timeweb Cloud создайте новое приложение "Backend"
2. Тип: Docker контейнер
3. Dockerfile: `backend/Dockerfile`
4. Порт: 8000

### Переменные окружения Backend:
```env
SECRET_KEY=8E7ExQa6dqn-yERIMMHbA_IzLdvTJ6Vw1mLSslMoBp0

POSTGRESQL_HOST=be96b16b290a1cfbdf0595d0.twc1.net
POSTGRESQL_PORT=5432
POSTGRESQL_USER=gen_user
POSTGRESQL_PASSWORD=ваш_пароль_от_бд
POSTGRESQL_DBNAME=default_db

PORT=8000
ENVIRONMENT=production
ADMIN_PASSWORD=ваш_пароль_администратора
CORS_ORIGINS=https://leowels-web-panel-b874.twc1.net
```

5. Задеплойте и получите URL Backend (например: `https://backend-xxxxx.twc1.net`)

---

## 📋 Шаг 2: Создайте Frontend приложение

1. В Timeweb Cloud создайте новое приложение "Frontend"
2. Тип: Docker контейнер
3. Dockerfile: `Dockerfile.frontend` (или переименуйте в `Dockerfile`)
4. Порт: 3000

### Переменные окружения Frontend:
```env
NEXT_PUBLIC_API_URL=https://backend-xxxxx.twc1.net
BACKEND_URL=https://backend-xxxxx.twc1.net
NODE_ENV=production
PORT=3000
```

**Важно:** Замените `https://backend-xxxxx.twc1.net` на реальный URL вашего Backend!

---

## ✅ Проверка

1. Backend: `https://backend-xxxxx.twc1.net/api/health` → `{"status": "ok"}`
2. Frontend: `https://leowels-web-panel-b874.twc1.net` → страница входа

---

## 🔧 Если Frontend не подключается к Backend

1. Проверьте `CORS_ORIGINS` в Backend - должен содержать домен Frontend
2. Проверьте `NEXT_PUBLIC_API_URL` в Frontend - должен быть URL Backend
3. Проверьте, что Backend доступен по HTTPS

