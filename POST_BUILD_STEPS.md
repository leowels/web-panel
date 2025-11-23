# 🚀 Следующие шаги после успешной сборки

## ✅ Сборка завершена успешно!

Docker образ собран и готов к деплою.

## 📋 Что делать дальше:

### 1. Если деплой через Docker:

```bash
# Запустить контейнер
docker run -d \
  -p 3000:3000 \
  -e SECRET_KEY=ваш_секретный_ключ \
  -e DATABASE_URL=postgresql://user:pass@host:5432/dbname \
  -e CORS_ORIGINS=https://yourdomain.com \
  -e NEXT_PUBLIC_API_URL=https://api.yourdomain.com \
  ваш-образ:latest
```

### 2. Если деплой через Timeweb Cloud:

1. **Проверьте статус деплоя** в панели управления Timeweb Cloud
2. **Настройте переменные окружения** в настройках приложения:
   - `SECRET_KEY`
   - `DATABASE_URL`
   - `CORS_ORIGINS`
   - `NEXT_PUBLIC_API_URL`
   - `AI_API_KEY` (если используете AI)

3. **Проверьте логи** приложения на наличие ошибок

### 3. Если деплой на VPS/сервер:

```bash
# 1. Скопируйте образ на сервер
docker save ваш-образ:latest | gzip > app.tar.gz
scp app.tar.gz user@server:/path/

# 2. На сервере загрузите образ
docker load < app.tar.gz

# 3. Запустите контейнер
docker run -d \
  --name rostekhnadzor-app \
  -p 3000:3000 \
  --env-file .env \
  ваш-образ:latest
```

### 4. Настройка переменных окружения (ОБЯЗАТЕЛЬНО!)

Создайте `.env` файл с production настройками:

```env
# КРИТИЧНО - обязательно настройте!
SECRET_KEY=<сгенерируйте: python -c "import secrets; print(secrets.token_urlsafe(32))">
DATABASE_URL=postgresql://user:password@host:5432/dbname
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
ENVIRONMENT=production

# Администратор
ADMIN_PASSWORD=<сильный_пароль>

# AI (опционально)
AI_PROVIDER=timeweb
AI_API_KEY=<ваш_ключ>
AI_BASE_URL=<url_вашего_агента>
AI_AGENT_ACCESS_ID=<access_id>

# Frontend
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

### 5. Проверка работы приложения:

1. **Откройте приложение** в браузере
2. **Войдите** с учетными данными администратора
3. **Проверьте:**
   - ✅ Дашборд загружается
   - ✅ Создание оборудования работает
   - ✅ Создание нарушений работает
   - ✅ AI генерация работает (если настроена)
   - ✅ Экспорт таблиц работает

### 6. Мониторинг:

```bash
# Проверьте логи контейнера
docker logs -f ваш-контейнер

# Проверьте статус
docker ps
```

## ⚠️ Важно!

- **НЕ используйте SQLite в production!** Используйте PostgreSQL
- **Настройте HTTPS** перед запуском в production
- **Измените пароль администратора** с дефолтного
- **Настройте резервное копирование** базы данных

## 🎉 Готово!

Если все настроено правильно, приложение должно работать!

---

**Нужна помощь?** Проверьте логи и убедитесь, что все переменные окружения настроены правильно.


