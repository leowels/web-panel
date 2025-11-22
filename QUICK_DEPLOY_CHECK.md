# 🚀 Быстрая проверка перед деплоем

## ⚠️ КРИТИЧНО - проверьте обязательно!

### 1. Секреты и безопасность
```bash
# Проверьте, что в коде НЕТ:
- Хардкоженных паролей
- API ключей в коде
- Секретных ключей в коде

# Все должно быть в .env файле!
```

### 2. База данных
```bash
# ❌ НЕ используйте SQLite в production!
# ✅ Используйте PostgreSQL или MySQL

# Проверьте DATABASE_URL в .env:
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

### 3. JWT Secret Key
```bash
# ❌ НЕ используйте дефолтный ключ!
# ✅ Сгенерируйте сильный случайный ключ:

# Python:
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Добавьте в .env:
JWT_SECRET_KEY=<сгенерированный_ключ>
```

### 4. CORS настройки
```bash
# ❌ НЕ используйте CORS_ORIGINS=*
# ✅ Укажите конкретные домены:

CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### 5. HTTPS
```bash
# ❌ НЕ деплойте без SSL сертификата!
# ✅ Настройте HTTPS перед деплоем
```

## 📋 Минимальный чеклист (5 минут)

- [ ] `.env` файл создан и содержит все секреты
- [ ] `.env` добавлен в `.gitignore` (уже есть ✅)
- [ ] `DATABASE_URL` указывает на production БД (не SQLite!)
- [ ] `JWT_SECRET_KEY` изменен с дефолтного
- [ ] `CORS_ORIGINS` содержит только production домены
- [ ] `DEBUG=False` или не установлен
- [ ] `NEXT_PUBLIC_API_URL` указывает на production API
- [ ] Пароль администратора изменен
- [ ] SSL сертификат установлен

## 🔧 Быстрая настройка production .env

Создайте файл `.env` в корне проекта:

```env
# Backend
ENVIRONMENT=production
DEBUG=False
SECRET_KEY=<сгенерируйте_сильный_ключ>
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET_KEY=<сгенерируйте_сильный_ключ>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS - укажите ваши домены через запятую!
# ✅ ИСПРАВЛЕНО: Теперь CORS читается из переменной окружения
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# AI
AI_PROVIDER=openai
AI_API_KEY=<ваш_ключ>
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4

# Frontend
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

**Важно:** CORS теперь настраивается через переменную `CORS_ORIGINS` в `.env` файле!

## 🧪 Тест перед деплоем

1. **Локальный тест:**
   ```bash
   # Backend
   cd backend
   python run.py
   
   # Frontend
   npm run build
   npm start
   ```

2. **Проверьте:**
   - Регистрация/вход работает
   - Создание оборудования работает
   - Создание нарушений работает
   - AI генерация работает
   - Экспорт таблиц работает

## 📝 Полный чеклист

Смотрите `PRE_DEPLOYMENT_CHECKLIST.md` для полного списка проверок.

---

**Помните:** Безопасность важнее скорости! Потратьте 10 минут на проверку, чтобы избежать проблем в production.

