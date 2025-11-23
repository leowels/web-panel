# ✅ Чеклист: Где и что проверить для запуска Backend

## 📍 1. В Timeweb Cloud - Настройки контейнера

### Перейдите: Панель управления → Ваше приложение → Настройки → Переменные окружения

Проверьте, что установлены **ВСЕ** эти переменные:

```env
✅ SECRET_KEY=<должен_быть_установлен>
✅ DATABASE_URL=postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=require
✅ PORT=8000
✅ ENVIRONMENT=production
✅ ADMIN_PASSWORD=<должен_быть_установлен>
✅ CORS_ORIGINS=https://yourdomain.com
```

**Где проверить:**
- Timeweb Cloud → Ваше приложение → Настройки → Переменные окружения

---

## 📍 2. В Timeweb Cloud - Логи контейнера

### Перейдите: Панель управления → Ваше приложение → Логи

Ищите в логах:

### ✅ Должно быть:
```
=== Запуск Backend на порту 8000 ===
Текущая директория: /app
Содержимое /app/backend:
Запуск: python run.py
Backend запущен с PID: X
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### ❌ Если видите ошибки:
- `ModuleNotFoundError` → проверьте requirements.txt
- `SECRET_KEY not found` → добавьте переменную SECRET_KEY
- `DATABASE_URL not found` → добавьте переменную DATABASE_URL
- `Connection refused` → проверьте DATABASE_URL
- `Permission denied` → проверьте права доступа

**Где проверить:**
- Timeweb Cloud → Ваше приложение → Логи

---

## 📍 3. В Timeweb Cloud - Статус контейнера

### Перейдите: Панель управления → Ваше приложение → Обзор

Проверьте:
- ✅ Статус: "Запущено" или "Работает"
- ✅ Порты: 3000 и 8000 должны быть открыты
- ✅ Последний перезапуск: недавно

**Где проверить:**
- Timeweb Cloud → Ваше приложение → Обзор

---

## 📍 4. В Git репозитории - Файлы

### Проверьте наличие файлов:

```bash
✅ Dockerfile.full (в корне)
✅ docker-entrypoint.sh (в корне)
✅ backend/Dockerfile (для отдельного Backend)
✅ backend/run.py
✅ backend/main.py
✅ backend/requirements.txt (должен содержать asyncpg)
```

**Где проверить:**
- Локально: `ls -la` в корне проекта
- Или в Git: проверьте, что файлы закоммичены

---

## 📍 5. В backend/requirements.txt

### Проверьте наличие:

```txt
✅ asyncpg==0.29.0  (для PostgreSQL)
✅ fastapi==0.104.1
✅ uvicorn[standard]==0.24.0
✅ sqlalchemy==2.0.23
```

**Где проверить:**
- Файл: `backend/requirements.txt`

---

## 📍 6. В backend/database.py

### Проверьте, что есть конвертация:

```python
# Должно быть:
if _raw_db_url.startswith("postgresql://"):
    DATABASE_URL = _raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
```

**Где проверить:**
- Файл: `backend/database.py` (строки 13-20)

---

## 📍 7. В Dockerfile.full

### Проверьте, что Backend копируется:

```dockerfile
# Должно быть:
COPY backend/ ./backend/
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
```

**Где проверить:**
- Файл: `Dockerfile.full` (строки 53, 56)

---

## 📍 8. В docker-entrypoint.sh

### Проверьте, что скрипт правильный:

```bash
# Должно быть:
cd /app/backend
python run.py &
```

**Где проверить:**
- Файл: `docker-entrypoint.sh` (строки 15, 35)

---

## 🔍 Быстрая диагностика

### Шаг 1: Проверьте переменные окружения
```
Timeweb Cloud → Приложение → Настройки → Переменные окружения
```

### Шаг 2: Проверьте логи
```
Timeweb Cloud → Приложение → Логи
```

### Шаг 3: Проверьте статус
```
Timeweb Cloud → Приложение → Обзор
```

---

## 🎯 Что делать, если Backend не запускается

### 1. Проверьте логи
- Откройте логи в Timeweb Cloud
- Ищите сообщения с "ОШИБКА" или "ERROR"
- Скопируйте ошибку

### 2. Проверьте переменные окружения
- Убедитесь, что все переменные установлены
- Особенно: `SECRET_KEY`, `DATABASE_URL`

### 3. Проверьте базу данных
- Убедитесь, что PostgreSQL доступна
- Проверьте `DATABASE_URL`

### 4. Перезапустите контейнер
- Остановите контейнер
- Запустите снова
- Подождите 1-2 минуты

---

## 📋 Чеклист для быстрой проверки

- [ ] Переменные окружения установлены (Timeweb Cloud)
- [ ] DATABASE_URL правильный
- [ ] SECRET_KEY установлен
- [ ] Логи показывают запуск Backend
- [ ] Нет ошибок в логах
- [ ] Контейнер в статусе "Запущено"
- [ ] Порты 3000 и 8000 открыты

---

**Начните с проверки логов - там будет видна причина!** 🔍


