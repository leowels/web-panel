# 🔧 Диагностика и исправление проблем с Docker контейнером

## Проблема: Backend не запущен (ECONNREFUSED)

Сообщение "Killed" означает, что контейнер был остановлен или упал.

## Шаг 1: Проверка статуса контейнера

```bash
# Проверьте все контейнеры
docker ps -a

# Найдите ваш контейнер (обычно называется web-panel или похожее)
docker ps -a | grep web-panel
```

## Шаг 2: Просмотр логов

```bash
# Посмотрите логи контейнера (замените CONTAINER_NAME на имя вашего контейнера)
docker logs CONTAINER_NAME

# Или последние 100 строк
docker logs --tail 100 CONTAINER_NAME

# Логи в реальном времени
docker logs -f CONTAINER_NAME
```

## Шаг 3: Перезапуск контейнера

### Если контейнер остановлен:

```bash
# Запустите существующий контейнер
docker start CONTAINER_NAME

# Проверьте логи
docker logs -f CONTAINER_NAME
```

### Если контейнер постоянно перезапускается:

```bash
# Остановите контейнер
docker stop CONTAINER_NAME

# Удалите контейнер (если нужно)
docker rm CONTAINER_NAME

# Пересоздайте и запустите заново (см. шаг 4)
```

## Шаг 4: Пересоздание контейнера

### Если используете docker run:

```bash
# Остановите и удалите старый контейнер
docker stop CONTAINER_NAME
docker rm CONTAINER_NAME

# Запустите новый контейнер
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

### Если используете docker-compose:

```bash
# Остановите и удалите контейнеры
docker-compose down

# Запустите заново
docker-compose up -d

# Смотрите логи
docker-compose logs -f
```

## Шаг 5: Проверка переменных окружения

Убедитесь, что все обязательные переменные установлены:

```bash
# Проверьте переменные контейнера
docker inspect CONTAINER_NAME | grep -A 20 "Env"

# Или через exec
docker exec CONTAINER_NAME env | grep -E "(SECRET_KEY|POSTGRESQL|PORT)"
```

### Обязательные переменные:
- ✅ `SECRET_KEY` - должен быть установлен!
- ✅ `POSTGRESQL_HOST`
- ✅ `POSTGRESQL_PORT`
- ✅ `POSTGRESQL_USER`
- ✅ `POSTGRESQL_PASSWORD`
- ✅ `POSTGRESQL_DBNAME`

## Шаг 6: Проверка работы Backend

После перезапуска проверьте:

```bash
# Проверьте, что контейнер запущен
docker ps | grep web-panel

# Проверьте логи Backend
docker logs CONTAINER_NAME | grep -i "backend\|uvicorn\|8000"

# Проверьте доступность Backend изнутри контейнера
docker exec CONTAINER_NAME curl http://localhost:8000/api/health

# Или снаружи
curl http://localhost:8000/api/health
```

## Частые причины падения контейнера

### 1. Отсутствует SECRET_KEY
**Ошибка в логах:** `ERROR: SECRET_KEY environment variable is not set!`

**Решение:** Установите переменную `SECRET_KEY` при запуске контейнера.

### 2. Ошибка подключения к БД
**Ошибка в логах:** `Failed to initialize database` или `connection refused`

**Решение:** 
- Проверьте настройки PostgreSQL
- Убедитесь, что БД доступна
- Проверьте `POSTGRESQL_SSL=false` для приватной сети

### 3. Backend падает при старте
**Ошибка в логах:** `Backend не запустился!` или ошибки Python

**Решение:**
- Проверьте логи: `docker logs CONTAINER_NAME`
- Убедитесь, что все зависимости установлены
- Проверьте, что код backend скопирован правильно

### 4. Недостаточно памяти
**Ошибка:** `Killed` без других сообщений

**Решение:**
- Увеличьте лимит памяти для контейнера
- Проверьте использование памяти: `docker stats CONTAINER_NAME`

## Для Timeweb Cloud

Если деплой на Timeweb Cloud:

1. **Проверьте логи в панели Timeweb Cloud:**
   - Откройте приложение
   - Перейдите в раздел "Логи" или "Logs"
   - Найдите ошибки

2. **Проверьте переменные окружения:**
   - Откройте настройки приложения
   - Убедитесь, что все переменные из `ENV_DOCKER.txt` установлены

3. **Перезапустите приложение:**
   - В панели Timeweb Cloud нажмите "Перезапустить"

## Быстрая диагностика

```bash
# 1. Статус контейнера
docker ps -a | grep web-panel

# 2. Последние логи
docker logs --tail 50 CONTAINER_NAME

# 3. Проверка процессов внутри контейнера
docker exec CONTAINER_NAME ps aux

# 4. Проверка портов
docker exec CONTAINER_NAME netstat -tlnp | grep -E "(3000|8000)"

# 5. Проверка переменных
docker exec CONTAINER_NAME env | grep -E "(SECRET_KEY|PORT|POSTGRESQL)"
```

## Если ничего не помогает

1. **Полностью пересоберите образ:**
   ```bash
   docker build -t web-panel:latest .
   ```

2. **Удалите старый контейнер и создайте новый:**
   ```bash
   docker stop CONTAINER_NAME
   docker rm CONTAINER_NAME
   # Затем запустите заново (см. шаг 4)
   ```

3. **Проверьте системные ресурсы:**
   ```bash
   docker stats
   df -h
   free -h
   ```



