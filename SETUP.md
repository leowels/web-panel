# Инструкция по установке и запуску

## Требования

- Node.js 18+ и npm
- Python 3.9+
- pip

## Установка Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt

# Создайте .env файл
cp .env.example .env

# Отредактируйте .env и добавьте:
# SECRET_KEY=ваш-секретный-ключ
# OPENAI_API_KEY=ваш-openai-api-ключ (опционально)

# Запустите сервер
python main.py
# или
python run.py
```

Backend будет доступен на `http://localhost:8000`

## Установка Frontend

```bash
# В корневой директории проекта
npm install

# Создайте .env.local файл
# NEXT_PUBLIC_API_URL=http://localhost:8000

# Запустите dev сервер
npm run dev
```

Frontend будет доступен на `http://localhost:3000`

## Учетные данные по умолчанию

- **Username**: admin
- **Password**: admin123

## Сборка для production

### Backend
```bash
cd backend
# Убедитесь, что .env настроен правильно
python main.py
```

### Frontend
```bash
npm run build
npm start
```

## PWA

Приложение поддерживает PWA (Progressive Web App). После сборки (`npm run build`), приложение можно установить на устройство и использовать оффлайн.

## Troubleshooting

1. **Ошибка подключения к API**: Убедитесь, что backend запущен и `NEXT_PUBLIC_API_URL` в `.env.local` указан правильно.

2. **Ошибка базы данных**: Убедитесь, что у вас есть права на запись в директории `backend/` для создания файла `inspectorhub.db`.

3. **Ошибка ИИ функций**: Убедитесь, что `OPENAI_API_KEY` установлен в `.env` файле backend. ИИ функции будут работать только с валидным API ключом.

