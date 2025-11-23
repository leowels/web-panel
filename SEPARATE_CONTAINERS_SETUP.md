# 🐳 Настройка отдельных контейнеров (Frontend + Backend)

## 📋 Структура

- **Frontend контейнер** - Next.js на порту 3000
- **Backend контейнер** - FastAPI на порту 8000

---

## 🎯 Шаг 1: Создание Backend приложения в Timeweb Cloud

### 1.1. Создайте новое приложение "Backend"

- **Тип:** Docker контейнер
- **Dockerfile:** `backend/Dockerfile` (или оставьте пустым, если Timeweb автоматически найдет)
- **Порт:** 8000

### 1.2. Переменные окружения для Backend:

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
CORS_ORIGINS=https://leowels-web-panel-b874.twc1.net,http://localhost:3000
```

### 1.3. Получите URL Backend

После деплоя Backend получите его URL, например:
- `https://backend-xxxxx.twc1.net` (технический домен)
- Или настройте свой домен для Backend

---

## 🎯 Шаг 2: Создание Frontend приложения в Timeweb Cloud

### 2.1. Создайте новое приложение "Frontend"

- **Тип:** Docker контейнер
- **Dockerfile:** `Dockerfile` (стандартный, только Next.js)
- **Порт:** 3000

### 2.2. Переменные окружения для Frontend:

```env
NEXT_PUBLIC_API_URL=https://backend-xxxxx.twc1.net
BACKEND_URL=https://backend-xxxxx.twc1.net
NODE_ENV=production
PORT=3000
```

**Важно:** Замените `https://backend-xxxxx.twc1.net` на реальный URL вашего Backend приложения!

---

## 🔧 Шаг 3: Настройка CORS

В Backend переменной `CORS_ORIGINS` должен быть указан домен Frontend:

```env
CORS_ORIGINS=https://leowels-web-panel-b874.twc1.net,http://localhost:3000
```

---

## ✅ Проверка работы

1. **Backend:**
   - Откройте: `https://backend-xxxxx.twc1.net/api/health`
   - Должно вернуться: `{"status": "ok", "version": "1.0.0"}`

2. **Frontend:**
   - Откройте: `https://leowels-web-panel-b874.twc1.net`
   - Должна открыться страница входа

3. **Проверка подключения:**
   - Попробуйте войти в систему
   - Если есть ошибки CORS - проверьте `CORS_ORIGINS` в Backend

---

## 📝 Преимущества этого подхода

✅ Независимое масштабирование  
✅ Можно перезапускать отдельно  
✅ Проще отладка  
✅ Можно использовать разные ресурсы  

---

## ⚠️ Важно

- Backend должен быть доступен по HTTPS
- Frontend должен знать точный URL Backend
- CORS должен быть настроен правильно

