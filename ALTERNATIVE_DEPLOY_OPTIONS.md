# 🔄 Альтернативные варианты запуска

## Вариант 1: Простой скрипт запуска (РЕКОМЕНДУЕТСЯ)

Используйте `Dockerfile.simple` и `start.sh` - более простой вариант без сложного entrypoint.

### Преимущества:
- ✅ Проще и понятнее
- ✅ Меньше кода
- ✅ Легче отлаживать

### Использование:
1. Переименуйте `Dockerfile.simple` в `Dockerfile`
2. Закоммитьте и запушьте
3. Timeweb Cloud автоматически использует новый Dockerfile

---

## Вариант 2: Отдельные контейнеры

Создайте два отдельных приложения в Timeweb Cloud:

### Frontend контейнер:
- Использует стандартный `Dockerfile` (только Next.js)
- Порт: 3000
- Переменные: `NEXT_PUBLIC_API_URL=https://backend-domain.com`

### Backend контейнер:
- Использует `backend/Dockerfile`
- Порт: 8000
- Переменные: `SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGINS`

### Преимущества:
- ✅ Независимое масштабирование
- ✅ Проще отладка
- ✅ Можно перезапускать отдельно

---

## Вариант 3: Next.js API Routes (прокси)

Используйте Next.js API routes для проксирования запросов к Backend.

### Создайте `app/api/[...path]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  
  const response = await fetch(`${backendUrl}/api/${path}`, {
    method: 'GET',
    headers: {
      'Authorization': request.headers.get('Authorization') || '',
    },
  })
  
  const data = await response.json()
  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  const body = await request.json()
  
  const response = await fetch(`${backendUrl}/api/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': request.headers.get('Authorization') || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  
  const data = await response.json()
  return NextResponse.json(data)
}
```

### Преимущества:
- ✅ Все запросы идут через один домен
- ✅ Нет проблем с CORS
- ✅ Проще настройка

---

## Вариант 4: Nginx как reverse proxy

Используйте Nginx для маршрутизации запросов.

### Создайте `nginx.conf`:
```nginx
server {
    listen 3000;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
    
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
    }
}
```

### Преимущества:
- ✅ Профессиональное решение
- ✅ Гибкая настройка
- ✅ Кэширование

---

## Вариант 5: Supervisor для управления процессами

Используйте supervisor для запуска обоих сервисов.

### Создайте `supervisord.conf`:
```ini
[supervisord]
nodaemon=true

[program:backend]
command=python /app/backend/run.py
directory=/app/backend
autostart=true
autorestart=true

[program:frontend]
command=node /app/server.js
directory=/app
autostart=true
autorestart=true
environment=PORT=3000
```

---

## 🎯 Рекомендация

Для начала попробуйте **Вариант 1** (простой скрипт) - он самый простой и должен работать.

Если не сработает - используйте **Вариант 3** (Next.js API routes) - это самый надежный вариант для production.

