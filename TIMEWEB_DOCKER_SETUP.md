# 🐳 Настройка Docker деплоя в Timeweb Cloud

## ✅ Да, у вас Docker деплой!

Судя по логам сборки (`RUN npm run build`), Timeweb Cloud использует Docker для деплоя вашего приложения.

## 📋 Что нужно проверить в Timeweb Cloud:

### 1. Тип приложения

В настройках приложения в Timeweb Cloud проверьте:

- **Тип:** Docker контейнер / Node.js приложение
- **Buildpack:** Автоматическое определение или Node.js

### 2. Команда запуска (CMD/Start Command)

В настройках приложения должна быть указана команда запуска:

#### Если это Frontend (Next.js):
```bash
npm start
```

Или:
```bash
NODE_ENV=production npm start
```

#### Если это Backend (FastAPI):
```bash
cd backend && python run.py
```

Или:
```bash
cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
```

### 3. Порт приложения

Убедитесь, что указан правильный порт:

- **Next.js:** Порт 3000 (или переменная `PORT`)
- **Backend:** Порт 8000 (или переменная `PORT`)

В переменных окружения добавьте:
```env
PORT=3000  # для Next.js
# или
PORT=8000  # для Backend
```

### 4. Переменные окружения (ОБЯЗАТЕЛЬНО!)

В настройках Docker контейнера в Timeweb Cloud добавьте:

#### Для Backend:
```env
SECRET_KEY=<сгенерируйте_ключ>
DATABASE_URL=postgresql://user:password@host:5432/dbname
CORS_ORIGINS=https://yourdomain.com
ENVIRONMENT=production
ADMIN_PASSWORD=<сильный_пароль>
PORT=8000
```

#### Для Frontend:
```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
PORT=3000
NODE_ENV=production
```

### 5. Проверка логов

Если приложение не запускается:

1. Откройте панель Timeweb Cloud
2. Перейдите в раздел **"Логи"** вашего приложения
3. Проверьте последние записи

**Типичные ошибки:**
- `Error: SECRET_KEY environment variable is not set`
- `Error: DATABASE_URL environment variable is not set`
- `Error: listen EADDRINUSE: address already in use :3000`
- `Module not found: Can't resolve '...'`

### 6. Health Check

Timeweb Cloud может проверять health check endpoint. Убедитесь, что:

- **Backend:** Есть endpoint `/api/health` (уже есть ✅)
- **Frontend:** Приложение отвечает на корневой путь `/`

### 7. Структура проекта

Timeweb Cloud должен видеть правильную структуру:

```
.
├── package.json          # для Next.js
├── backend/
│   ├── requirements.txt  # для Python
│   └── run.py           # точка входа
└── ...
```

### 8. Если приложение все еще в ожидании:

1. **Проверьте логи** - там должна быть причина
2. **Убедитесь, что все переменные окружения установлены**
3. **Проверьте команду запуска** - она должна быть правильной
4. **Перезапустите приложение** после настройки переменных

### 9. Генерация SECRET_KEY

Если нужно сгенерировать SECRET_KEY:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## 🔍 Как проверить, что это Docker:

В логах сборки вы должны видеть:
- `RUN npm install`
- `RUN npm run build`
- `EXPORT` команды
- `DONE` в конце

Это подтверждает, что используется Docker.

## ⚠️ Важно:

1. **База данных:** Используйте PostgreSQL, не SQLite!
2. **Порты:** Убедитесь, что порты правильно настроены
3. **Переменные окружения:** Все обязательные переменные должны быть установлены
4. **Логи:** Всегда проверяйте логи при проблемах

---

**Следующий шаг:** Проверьте логи в панели Timeweb Cloud и убедитесь, что все переменные окружения установлены!


