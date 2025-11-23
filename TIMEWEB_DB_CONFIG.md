# 🗄️ Настройка PostgreSQL для Timeweb Cloud

## ✅ Ваша база данных

**Строка подключения:**
```
postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=verify-full
```

## 📋 Настройка в Timeweb Cloud

### 1. Добавьте переменную окружения DATABASE_URL

В настройках вашего Docker контейнера добавьте:

```env
DATABASE_URL=postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=require
```

**Важно:** 
- Используйте `sslmode=require` вместо `verify-full` (проще для Docker)
- Или оставьте `verify-full`, если нужна полная проверка SSL

### 2. Обновлен requirements.txt

Добавлен `asyncpg==0.29.0` для работы с PostgreSQL через SQLAlchemy async.

### 3. Обновлен database.py

Теперь автоматически конвертирует `postgresql://` в `postgresql+asyncpg://` для SQLAlchemy.

## 🔧 Полный список переменных окружения

Для вашего контейнера в Timeweb Cloud:

```env
# База данных (ОБЯЗАТЕЛЬНО!)
DATABASE_URL=postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=require

# Backend (ОБЯЗАТЕЛЬНО!)
SECRET_KEY=<сгенерируйте: python -c "import secrets; print(secrets.token_urlsafe(32))">
PORT=8000
ENVIRONMENT=production
ADMIN_PASSWORD=<сильный_пароль>
CORS_ORIGINS=https://yourdomain.com

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
   - Проверьте, что `DATABASE_URL` правильный
   - Проверьте, что база данных доступна
   - Попробуйте изменить `sslmode=require` на `sslmode=prefer`

## ⚠️ Важно

- **SSL режим:** `require` проще для Docker, `verify-full` требует сертификат
- **Пароль:** В URL уже закодирован, используйте как есть
- **Хост:** `89356825ac9345a31cecb670.twc1.net` - это внутренний хост Timeweb Cloud

## 🔄 После настройки

1. Закоммитьте изменения:
   ```bash
   git add backend/requirements.txt backend/database.py
   git commit -m "feat: добавлена поддержка PostgreSQL"
   git push
   ```

2. Пересоберите контейнер в Timeweb Cloud

3. Проверьте работу приложения

---

**Готово! База данных настроена!** 🎉

