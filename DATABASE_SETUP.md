# 🗄️ Настройка PostgreSQL базы данных

## ✅ База данных создана!

Ваша строка подключения:
```
postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=verify-full
```

## 📋 Настройка для Docker контейнера

### 1. Переменная окружения DATABASE_URL

В Timeweb Cloud в настройках контейнера добавьте:

```env
DATABASE_URL=postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=verify-full
```

**Важно:** Используйте строку как есть, с URL-encoding.

### 2. SSL сертификат

Для `sslmode=verify-full` нужен SSL сертификат. Есть два варианта:

#### Вариант А: Использовать require (проще)

Измените `sslmode` на `require`:
```env
DATABASE_URL=postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=require
```

#### Вариант Б: Добавить сертификат в контейнер

Если нужен `verify-full`, добавьте сертификат в Dockerfile.

### 3. Обновить requirements.txt для PostgreSQL

Убедитесь, что в `backend/requirements.txt` есть:

```txt
psycopg2-binary==2.9.9
```

Или для асинхронной работы:
```txt
asyncpg==0.29.0
```

## 🔧 Проверка подключения

### Локально (для теста):

```bash
# Декодированная строка (для понимания):
# postgresql://gen_user:X)c{$h5Ct%0{e=@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=verify-full

# Тест подключения:
psql 'postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=require'
```

## ⚠️ Важно для Docker

### 1. Используйте sslmode=require

В Docker контейнере проще использовать `sslmode=require` вместо `verify-full`:

```env
DATABASE_URL=postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=require
```

### 2. Проверьте, что psycopg2 установлен

В `backend/requirements.txt` должна быть строка:
```txt
psycopg2-binary==2.9.9
```

Если её нет - добавьте и пересоберите контейнер.

## 📝 Полный список переменных окружения

Для вашего контейнера:

```env
# База данных
DATABASE_URL=postgresql://gen_user:X)c%7B%24h5Ct%250%7Be%3D@89356825ac9345a31cecb670.twc1.net:5432/default_db?sslmode=require

# Backend
SECRET_KEY=<сгенерируйте_ключ>
PORT=8000
ENVIRONMENT=production
ADMIN_PASSWORD=<сильный_пароль>
CORS_ORIGINS=https://yourdomain.com

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
PORT=3000
NODE_ENV=production
```

## 🧪 Тест подключения

После настройки переменных окружения:

1. Перезапустите контейнер
2. Проверьте логи - должны быть сообщения о подключении к БД
3. Если есть ошибки подключения - проверьте `DATABASE_URL`

---

**Готово! Теперь база данных настроена!** 🎉


