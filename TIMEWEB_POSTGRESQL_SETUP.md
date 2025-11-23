# 🗄️ Настройка PostgreSQL для Timeweb Cloud

## ✅ Ваши данные базы данных

```
POSTGRESQL_HOST=be96b16b290a1cfbdf0595d0.twc1.net
POSTGRESQL_PORT=5432
POSTGRESQL_USER=gen_user
POSTGRESQL_PASSWORD=******** (ваш пароль)
POSTGRESQL_DBNAME=default_db
```

## 📋 Два способа настройки

### Способ 1: Отдельные переменные (РЕКОМЕНДУЕТСЯ) ✅

В настройках Docker контейнера в Timeweb Cloud добавьте:

```env
POSTGRESQL_HOST=be96b16b290a1cfbdf0595d0.twc1.net
POSTGRESQL_PORT=5432
POSTGRESQL_USER=gen_user
POSTGRESQL_PASSWORD=ваш_реальный_пароль
POSTGRESQL_DBNAME=default_db
```

**Преимущества:**
- Проще управлять в интерфейсе Timeweb Cloud
- Пароль автоматически URL-кодируется
- Легче изменять отдельные параметры

### Способ 2: Полная строка DATABASE_URL

Если предпочитаете один параметр, сформируйте строку:

```env
DATABASE_URL=postgresql://gen_user:ваш_пароль@be96b16b290a1cfbdf0595d0.twc1.net:5432/default_db?sslmode=require
```

**Важно:** 
- Замените `ваш_пароль` на реальный пароль
- Если пароль содержит специальные символы (`@`, `:`, `/`, `%`), их нужно URL-кодировать:
  - `@` → `%40`
  - `:` → `%3A`
  - `/` → `%2F`
  - `%` → `%25`
  - пробел → `%20`

## 🔧 Полный список переменных окружения

Для вашего контейнера в Timeweb Cloud:

```env
# База данных (выберите ОДИН из способов выше)
POSTGRESQL_HOST=be96b16b290a1cfbdf0595d0.twc1.net
POSTGRESQL_PORT=5432
POSTGRESQL_USER=gen_user
POSTGRESQL_PASSWORD=ваш_реальный_пароль
POSTGRESQL_DBNAME=default_db

# ИЛИ используйте полную строку:
# DATABASE_URL=postgresql://gen_user:пароль@be96b16b290a1cfbdf0595d0.twc1.net:5432/default_db?sslmode=require

# Backend (ОБЯЗАТЕЛЬНО!)
SECRET_KEY=<сгенерируйте: python -c "import secrets; print(secrets.token_urlsafe(32))">
PORT=8000
ENVIRONMENT=production
ADMIN_PASSWORD=<сильный_пароль>
CORS_ORIGINS=https://yourdomain.com,http://localhost:3000

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
PORT=3000
NODE_ENV=production
```

## 🧪 Проверка подключения

После настройки переменных окружения:

1. **Перезапустите контейнер** в Timeweb Cloud
2. **Проверьте логи** - должны быть сообщения:
   ```
   ✓ Database tables initialized successfully
   INFO:     Uvicorn running on http://0.0.0.0:8000
   ```
3. **Если есть ошибки подключения:**
   - Проверьте, что все переменные POSTGRESQL_* заданы правильно
   - Убедитесь, что пароль правильный
   - Проверьте, что база данных доступна из контейнера (firewall, сеть)

## ⚠️ Важные замечания

1. **SSL подключение:** Используется `sslmode=require` для безопасного подключения
2. **Пароль:** Автоматически URL-кодируется при использовании POSTGRESQL_PASSWORD
3. **Fallback:** Если переменные не заданы, используется SQLite (только для разработки!)

## 🔍 Диагностика проблем

### Ошибка: "Connection refused"
- Проверьте POSTGRESQL_HOST и POSTGRESQL_PORT
- Убедитесь, что база данных доступна из сети Timeweb Cloud

### Ошибка: "Authentication failed"
- Проверьте POSTGRESQL_USER и POSTGRESQL_PASSWORD
- Убедитесь, что пароль правильный (без лишних пробелов)

### Ошибка: "Database does not exist"
- Проверьте POSTGRESQL_DBNAME
- Убедитесь, что база данных `default_db` существует

---

**Готово! Теперь база данных настроена!** 🎉

