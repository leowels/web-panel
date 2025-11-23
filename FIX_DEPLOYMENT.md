# 🔧 Исправление проблемы деплоя

## Проблема: Сайт не открывается

### Шаг 1: Проверьте Dockerfile в Timeweb Cloud

В настройках приложения убедитесь, что указан:
- **Dockerfile:** `Dockerfile.full` (не просто `Dockerfile`)

### Шаг 2: Проверьте логи запуска

В Timeweb Cloud откройте раздел "Логи" и найдите:
- Сообщения от `docker-entrypoint.sh`
- Ошибки запуска Backend или Frontend

### Шаг 3: Проверьте переменные окружения

Убедитесь, что все переменные установлены:

```env
SECRET_KEY=8E7ExQa6dqn-yERIMMHbA_IzLdvTJ6Vw1mLSslMoBp0

POSTGRESQL_HOST=be96b16b290a1cfbdf0595d0.twc1.net
POSTGRESQL_PORT=5432
POSTGRESQL_USER=gen_user
POSTGRESQL_PASSWORD=ваш_пароль
POSTGRESQL_DBNAME=default_db

BACKEND_PORT=8000
PORT=8000
FRONTEND_PORT=3000

ENVIRONMENT=production
ADMIN_PASSWORD=ваш_пароль
CORS_ORIGINS=https://leowels-web-panel-b874.twc1.net,http://localhost:3000

NEXT_PUBLIC_API_URL=http://localhost:8000
BACKEND_URL=http://localhost:8000
NODE_ENV=production
```

### Шаг 4: Проверьте порты

В настройках контейнера:
- Порт 3000 должен быть открыт для внешнего доступа
- Порт 8000 может быть только внутренним

### Шаг 5: Если entrypoint не работает

Если в логах нет сообщений от `docker-entrypoint.sh`, возможно Timeweb Cloud использует другую команду запуска.

Проверьте настройки "Start Command" или "CMD" - там должно быть пусто или указано:
```
/app/docker-entrypoint.sh
```

### Шаг 6: Альтернативное решение

Если проблема не решается, можно запустить сервисы напрямую через CMD в Dockerfile.

Но сначала проверьте логи - там будет видна конкретная ошибка!

