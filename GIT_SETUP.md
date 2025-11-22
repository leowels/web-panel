# 📦 Инструкция по созданию Git репозитория

## 🚀 Быстрый старт

### 1. Инициализация Git (если еще не сделано)

```bash
# Перейдите в корневую директорию проекта
cd "D:\web panel"

# Инициализируйте Git репозиторий
git init

# Добавьте все файлы
git add .

# Сделайте первый коммит
git commit -m "Initial commit: Rostekhnadzor Panel - SPA система управления подъемными сооружениями"
```

### 2. Создание репозитория на GitHub

#### Вариант А: Через веб-интерфейс GitHub

1. Зайдите на [GitHub.com](https://github.com) и войдите в аккаунт
2. Нажмите кнопку **"+"** в правом верхнем углу → **"New repository"**
3. Заполните форму:
   - **Repository name:** `rostekhnadzor-panel` (или другое имя)
   - **Description:** `SPA система управления подъемными сооружениями для Ростехнадзора`
   - **Visibility:** Private (рекомендуется) или Public
   - **НЕ** добавляйте README, .gitignore или license (они уже есть)
4. Нажмите **"Create repository"**

#### Вариант Б: Через GitHub CLI (если установлен)

```bash
gh repo create rostehnadzor-panel --private --source=. --remote=origin --push
```

### 3. Подключение к удаленному репозиторию

После создания репозитория на GitHub, выполните:

```bash
# Добавьте remote (замените YOUR_USERNAME на ваш GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/rostekhnadzor-panel.git

# Или через SSH (если настроен):
# git remote add origin git@github.com:YOUR_USERNAME/rostekhnadzor-panel.git

# Проверьте подключение
git remote -v

# Отправьте код в репозиторий
git branch -M main
git push -u origin main
```

## 📝 Что уже подготовлено

✅ `.gitignore` - настроен для исключения:
- `node_modules/`
- `.env` файлы
- База данных SQLite
- Загруженные файлы (`uploads/`)
- Build артефакты

✅ `README.md` - описание проекта

✅ Документация:
- `PRE_DEPLOYMENT_CHECKLIST.md` - чеклист перед деплоем
- `QUICK_DEPLOY_CHECK.md` - быстрая проверка
- `SECURITY_AUDIT_REPORT.md` - отчет о безопасности

## ⚠️ ВАЖНО перед коммитом

### Проверьте, что НЕ попадет в репозиторий:

```bash
# Проверьте, что .env файлы игнорируются
git status | grep .env

# Если видите .env файлы, они НЕ должны быть в списке для коммита!
```

### Убедитесь, что секреты не в коде:

```bash
# Проверьте на наличие секретов в коде
grep -r "sk-" backend/ --exclude-dir=__pycache__
grep -r "your-secret-key" backend/
grep -r "password.*=" backend/ --exclude="*.md"
```

## 🔐 Безопасность

### Что НИКОГДА не должно попасть в Git:

- ❌ `.env` файлы
- ❌ Файлы с паролями и ключами
- ❌ База данных SQLite
- ❌ Загруженные пользователями файлы
- ❌ Логи с чувствительными данными

### Что ДОЛЖНО быть в Git:

- ✅ `.env.example` - примеры переменных окружения (без реальных ключей)
- ✅ `README.md` - документация
- ✅ Весь исходный код
- ✅ `requirements.txt` и `package.json`
- ✅ Конфигурационные файлы

## 📋 Рекомендуемая структура коммитов

```bash
# Первый коммит
git commit -m "Initial commit: Rostekhnadzor Panel"

# Или разбейте на несколько коммитов:
git add backend/
git commit -m "feat: Backend API with FastAPI, SQLAlchemy, JWT auth"

git add app/ components/ store/
git commit -m "feat: Frontend with Next.js, React, Zustand"

git add *.md
git commit -m "docs: Add documentation and deployment checklists"

git add .gitignore README.md
git commit -m "chore: Add gitignore and README"
```

## 🚀 После создания репозитория

1. **Добавьте описание проекта** в настройках репозитория на GitHub
2. **Настройте ветки:**
   - `main` - production код
   - `develop` - development ветка (опционально)
3. **Включите защиту веток:**
   - Требовать review перед merge
   - Требовать проверки статуса
4. **Добавьте теги для релизов:**
   ```bash
   git tag -a v1.0.0 -m "First release"
   git push origin v1.0.0
   ```

## 📚 Полезные команды Git

```bash
# Проверить статус
git status

# Посмотреть изменения
git diff

# Добавить файлы
git add .

# Коммит
git commit -m "Описание изменений"

# Отправить в репозиторий
git push origin main

# Получить изменения
git pull origin main

# Создать новую ветку
git checkout -b feature/new-feature

# Посмотреть историю
git log --oneline
```

## 🔗 Альтернативные платформы

Если не хотите использовать GitHub, можно использовать:

- **GitLab:** https://gitlab.com
- **Bitbucket:** https://bitbucket.org
- **Self-hosted Git:** Gitea, GitLab CE

Процесс аналогичный, только URL будет другой.

## ✅ Чеклист перед первым push

- [ ] `.env` файлы не добавлены в Git
- [ ] База данных SQLite не добавлена
- [ ] Нет секретов в коде
- [ ] `.gitignore` настроен правильно
- [ ] README.md обновлен
- [ ] Все работает локально
- [ ] Репозиторий создан на GitHub/GitLab
- [ ] Remote добавлен
- [ ] Готов к push

---

**Готово!** После выполнения этих шагов ваш проект будет в Git репозитории.

