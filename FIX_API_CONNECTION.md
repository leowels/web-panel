# 🔧 Исправление ошибки ERR_CONNECTION_REFUSED

## Проблема
```
POST http://localhost:8000/api/auth/login net::ERR_CONNECTION_REFUSED
```

## Причина

Frontend пытается подключиться к Backend по `localhost:8000`, но:
- В production `localhost` не работает
- Нужен реальный URL Backend сервера

## Решение

### Вариант 1: Если Frontend и Backend в одном контейнере

В переменных окружения установите:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Но это работает только если оба сервиса в одном контейнере!

### Вариант 2: Если Frontend и Backend в разных контейнерах

В переменных окружения Frontend установите:
```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

Или если Backend на том же домене:
```env
NEXT_PUBLIC_API_URL=https://yourdomain.com:8000
```

### Вариант 3: Использовать относительный путь (рекомендуется)

Измените в коде использование API URL:

Вместо:
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
```

Используйте:
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin.replace(':3000', ':8000') : 'http://localhost:8000')
```

Или проще - если Backend на том же домене:
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api'
```

И настройте Next.js прокси в `next.config.js`.

## Быстрое решение для одного контейнера

### 1. Проверьте переменные окружения

В Timeweb Cloud убедитесь, что установлено:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2. Проверьте, что Backend запущен

В логах контейнера должны быть сообщения:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 3. Проверьте порты

Убедитесь, что:
- Порт 3000 открыт для Frontend
- Порт 8000 открыт для Backend (или доступен внутри контейнера)

## Проверка работы

1. **Проверьте Backend:**
   - Откройте логи контейнера
   - Должны быть сообщения о запуске сервера

2. **Проверьте Frontend:**
   - Откройте консоль браузера (F12)
   - Проверьте, нет ли других ошибок

3. **Проверьте переменные окружения:**
   - В Timeweb Cloud проверьте, что `NEXT_PUBLIC_API_URL` установлен правильно

## Если все еще не работает

1. **Проверьте логи контейнера** - там должна быть причина
2. **Убедитесь, что оба сервиса запущены** - проверьте процессы
3. **Проверьте CORS** - `CORS_ORIGINS` должен содержать ваш домен

---

**Следующий шаг:** Проверьте переменные окружения в Timeweb Cloud! 🔍


