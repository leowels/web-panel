# ⚡ Быстрая настройка PostgreSQL в Timeweb Cloud

## 📝 Что нужно сделать

В настройках Docker контейнера в Timeweb Cloud добавьте эти переменные окружения:

```env
POSTGRESQL_HOST=be96b16b290a1cfbdf0595d0.twc1.net
POSTGRESQL_PORT=5432
POSTGRESQL_USER=gen_user
POSTGRESQL_PASSWORD=ваш_реальный_пароль_здесь
POSTGRESQL_DBNAME=default_db
```

**Важно:** Замените `ваш_реальный_пароль_здесь` на ваш настоящий пароль от базы данных!

## ✅ Другие обязательные переменные

Также убедитесь, что у вас настроены:

```env
SECRET_KEY=<сгенерированный_ключ>
PORT=8000
ENVIRONMENT=production
ADMIN_PASSWORD=<пароль_администратора>
CORS_ORIGINS=https://yourdomain.com,http://localhost:3000
```

## 🔄 После настройки

1. **Сохраните** переменные окружения
2. **Перезапустите** контейнер
3. **Проверьте логи** - должно быть:
   ```
   ✓ Database tables initialized successfully
   INFO:     Uvicorn running on http://0.0.0.0:8000
   ```

## ❓ Если не работает

Проверьте логи контейнера - там будет видно конкретную ошибку подключения к БД.

---

**Готово!** 🎉

