# ✅ Исправление: Dockerfile не найден

## Проблема
```
error: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
```

## Решение

Создан `Dockerfile` для Next.js приложения. Теперь Timeweb Cloud сможет собрать Docker образ.

## Что было сделано:

1. ✅ Создан `Dockerfile` для Next.js
2. ✅ Обновлен `next.config.js` для standalone режима
3. ✅ Создан `.dockerignore` для оптимизации сборки

## Следующие шаги:

1. **Закоммитьте изменения:**
   ```bash
   git add Dockerfile .dockerignore next.config.js
   git commit -m "feat: добавлен Dockerfile для деплоя"
   git push
   ```

2. **В Timeweb Cloud:**
   - Дождитесь автоматической пересборки
   - Или запустите сборку вручную

3. **Настройте переменные окружения:**
   ```env
   PORT=3000
   NODE_ENV=production
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   ```

## Структура Dockerfile:

- **deps:** Установка зависимостей
- **builder:** Сборка приложения
- **runner:** Production образ (минимальный размер)

## Важно:

- Dockerfile использует multi-stage build для оптимизации
- Standalone режим Next.js уменьшает размер образа
- Приложение будет слушать порт 3000

---

**После коммита и push сборка должна пройти успешно!** 🚀


