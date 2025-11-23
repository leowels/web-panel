# 🐳 Деплой через Docker (Frontend + Backend в одном контейнере)

## 📦 Сборка образа

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  --build-arg BACKEND_URL=http://localhost:8000 \
  -t web-panel:latest .
```

## 🚀 Запуск контейнера

```bash
docker run -d \
  -p 3000:3000 \
  -p 8000:8000 \
  -e SECRET_KEY=ваш_secret_key \
  -e POSTGRESQL_HOST=host \
  -e POSTGRESQL_PORT=5432 \
  -e POSTGRESQL_USER=user \
  -e POSTGRESQL_PASSWORD=password \
  -e POSTGRESQL_DBNAME=dbname \
  -e BACKEND_PORT=8000 \
  -e FRONTEND_PORT=3000 \
  -e CORS_ORIGINS=http://localhost:3000 \
  -e ENVIRONMENT=production \
  --name web-panel \
  web-panel:latest
```

## 🔧 Переменные окружения

### Обязательные:
- `SECRET_KEY` - секретный ключ для JWT
- `POSTGRESQL_HOST`, `POSTGRESQL_PORT`, `POSTGRESQL_USER`, `POSTGRESQL_PASSWORD`, `POSTGRESQL_DBNAME` - настройки БД

### Опциональные:
- `BACKEND_PORT` - порт Backend (по умолчанию 8000)
- `FRONTEND_PORT` - порт Frontend (по умолчанию 3000)
- `CORS_ORIGINS` - разрешенные домены для CORS
- `ENVIRONMENT` - окружение (production/development)

## 📝 Для Timeweb Cloud

### Настройки:
- **Dockerfile:** `Dockerfile` (в корне)
- **Порты:** 3000, 8000
- **Build Arguments:**
  - `NEXT_PUBLIC_API_URL` - URL Backend (например: `http://localhost:8000` или `https://your-domain.com`)
  - `BACKEND_URL` - URL Backend

### Переменные окружения:
См. `ENV_DOCKER.txt` - **ОБЯЗАТЕЛЬНО укажите SECRET_KEY!**

## ✅ Проверка

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000/api/health`

