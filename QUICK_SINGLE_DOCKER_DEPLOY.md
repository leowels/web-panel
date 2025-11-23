# ⚡ Быстрый деплой в одном Docker контейнере

## ✅ Да, можно! Frontend + Backend в одном контейнере

## 📋 Быстрая инструкция

### 1. Закоммитьте файлы

```bash
git add Dockerfile.full docker-entrypoint.sh
git commit -m "feat: единый Dockerfile для Frontend + Backend"
git push
```

### 2. Создайте приложение в Timeweb Cloud

- **Тип:** Docker контейнер
- **Dockerfile:** `Dockerfile.full`
- **Порт:** 3000 (основной)

### 3. Настройте переменные окружения

```env
# Frontend
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:8000

# Backend
SECRET_KEY=<сгенерируйте: python -c "import secrets; print(secrets.token_urlsafe(32))">
DATABASE_URL=postgresql://user:password@host:5432/dbname
CORS_ORIGINS=https://yourdomain.com
ENVIRONMENT=production
PORT=8000
ADMIN_PASSWORD=<сильный_пароль>

# AI (опционально)
AI_PROVIDER=timeweb
AI_API_KEY=<ваш_ключ>
AI_BASE_URL=<url_вашего_агента>
AI_AGENT_ACCESS_ID=<access_id>
```

### 4. Создайте PostgreSQL базу данных

В Timeweb Cloud создайте PostgreSQL и укажите в `DATABASE_URL`.

### 5. Запустите сборку

Дождитесь завершения (15-20 минут для первой сборки).

### 6. Проверьте работу

- Frontend: `https://yourdomain.com`
- Backend API: `https://yourdomain.com:8000/api/health` (или через прокси)

## ⚠️ Важно

- **Порты:** Frontend на 3000, Backend на 8000
- **CORS:** `CORS_ORIGINS` должен содержать ваш домен
- **API URL:** В production измените `NEXT_PUBLIC_API_URL` на внешний URL Backend

## 🎯 Преимущества одного контейнера

✅ Проще управление  
✅ Меньше настроек  
✅ Быстрее деплой  
✅ Один контейнер вместо двух

## 📝 Что происходит внутри

1. Запускается Backend на порту 8000
2. Запускается Frontend на порту 3000
3. Оба сервиса работают параллельно
4. При остановке контейнера оба сервиса корректно завершаются

---

**Готово! Теперь все в одном контейнере!** 🚀


