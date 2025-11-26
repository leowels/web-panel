# 🔨 Команды сборки

## Backend (FastAPI)

### Локальная сборка Docker образа:

```bash
docker build -f backend/Dockerfile -t backend-app:latest .
```

### Сборка с указанием контекста (из корня репозитория):

```bash
# Убедитесь, что вы в корне репозитория
docker build -f backend/Dockerfile -t backend-app:latest .
```

### Запуск собранного образа локально:

```bash
docker run -p 8000:8000 \
  -e SECRET_KEY=ваш_secret_key \
  -e POSTGRESQL_HOST=host \
  -e POSTGRESQL_PORT=5432 \
  -e POSTGRESQL_USER=user \
  -e POSTGRESQL_PASSWORD=password \
  -e POSTGRESQL_DBNAME=dbname \
  -e PORT=8000 \
  -e ENVIRONMENT=production \
  -e CORS_ORIGINS=http://localhost:3000 \
  backend-app:latest
```

---

## Frontend (Next.js)

### Локальная сборка Docker образа:

```bash
docker build -f Dockerfile.frontend \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  --build-arg BACKEND_URL=http://localhost:8000 \
  -t frontend-app:latest .
```

### Запуск собранного образа локально:

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  frontend-app:latest
```

---

## ⚠️ Важно для Timeweb Cloud

В Timeweb Cloud сборка происходит **автоматически** при деплое:
- Укажите путь к Dockerfile: `backend/Dockerfile` (для Backend) или `Dockerfile.frontend` (для Frontend)
- Укажите переменные окружения в настройках приложения
- Для Frontend укажите Build Arguments: `NEXT_PUBLIC_API_URL` и `BACKEND_URL`

**Локальная сборка нужна только для тестирования перед деплоем!**



