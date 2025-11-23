# InspectorHub - Система управления инспекциями

Корпоративная SPA-панель для управления документами с поддержкой ИИ, drag&drop, автозаполнения и оффлайн работы.

## Технологии

- **Frontend**: Next.js 14, React 18, TypeScript, TailwindCSS, Zustand
- **Backend**: FastAPI, SQLAlchemy, SQLite
- **Аутентификация**: JWT токены
- **ИИ**: OpenAI API
- **PWA**: Service Worker, Manifest

## 🚀 Деплой

Проект готов к деплою с отдельными контейнерами для Frontend и Backend.

**📖 Подробные инструкции:**
- `DEPLOYMENT_GUIDE.md` - полное руководство по деплою
- `QUICK_DEPLOY.md` - быстрый старт
- `DEPLOY_CHECKLIST.md` - чеклист перед деплоем

**📝 Файлы с переменными окружения:**
- `backend/ENV_BACKEND.txt` - для Backend
- `ENV_FRONTEND.txt` - для Frontend

**🐳 Dockerfile:**
- `Dockerfile.frontend` - для Frontend (Next.js)
- `backend/Dockerfile` - для Backend (FastAPI)

---

## Быстрый старт (локально)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Создайте .env файл
cp ENV_EXAMPLE.txt .env
# Отредактируйте .env и добавьте SECRET_KEY, DATABASE_URL и другие переменные

# Запустите сервер
python run.py
```

Backend будет доступен на `http://localhost:8000`

### Frontend

```bash
npm install
npm run dev
```

Frontend будет доступен на `http://localhost:3000`

## Учетные данные по умолчанию

- **Username**: admin
- **Password**: admin123

## Возможности

- ✅ Аутентификация через JWT токены
- ✅ Управление документами (CRUD)
- ✅ Drag & Drop для переупорядочивания документов
- ✅ Автозаполнение полей
- ✅ ИИ помощник (OpenAI)
- ✅ PWA поддержка (оффлайн работа)
- ✅ Адаптивный дизайн (мобильная версия)
- ✅ Поиск по документам
- ✅ Фильтрация по статусам

## Структура проекта

```
.
├── app/                    # Next.js App Router
│   ├── dashboard/         # Главная панель
│   ├── login/             # Страница входа
│   └── register/          # Страница регистрации
├── components/            # React компоненты
│   ├── DocumentList.tsx   # Список документов с drag&drop
│   ├── DocumentEditor.tsx # Редактор документов
│   ├── AIPanel.tsx        # ИИ помощник
│   └── AutocompleteInput.tsx # Автозаполнение
├── store/                 # Zustand stores
│   ├── authStore.ts       # Аутентификация
│   └── documentStore.ts   # Документы
└── backend/               # FastAPI backend
    └── main.py            # API сервер
```

## API Endpoints

- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `GET /api/users/me` - Текущий пользователь
- `GET /api/documents` - Список документов
- `POST /api/documents` - Создать документ
- `PUT /api/documents/{id}` - Обновить документ
- `DELETE /api/documents/{id}` - Удалить документ
- `POST /api/ai/generate` - Генерация через ИИ

## Переменные окружения

### Backend (.env)

```
SECRET_KEY=your-secret-key
OPENAI_API_KEY=your-openai-api-key
```

### Frontend (.env.local)

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Разработка

Проект использует:
- TypeScript для типобезопасности
- TailwindCSS для стилизации
- Zustand для управления состоянием
- React Beautiful DnD для drag&drop
- date-fns для работы с датами

## Лицензия

MIT

