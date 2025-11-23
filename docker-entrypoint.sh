#!/bin/sh
# Не используем set -e, чтобы видеть все ошибки
set +e

echo "=========================================="
echo "=== Запуск Backend на порту 8000 ==="
echo "=========================================="

# Переходим в директорию backend
echo "Текущая директория: $(pwd)"
echo "Содержимое /app:"
ls -la /app/ || true
echo "Содержимое /app/backend:"
ls -la /app/backend/ || true

cd /app/backend || { echo "ОШИБКА: Директория /app/backend не найдена!"; exit 1; }

# Проверяем наличие файла run.py
if [ ! -f "run.py" ]; then
    echo "ОШИБКА: Файл run.py не найден в /app/backend!"
    ls -la /app/backend/
    exit 1
fi

# Проверяем Python
echo "Проверка Python:"
python --version || { echo "ОШИБКА: Python не найден!"; exit 1; }

# Проверяем PATH
echo "PATH: $PATH"
echo "Проверка доступности Python пакетов:"
python -c "import sys; print('Python path:', sys.path)" || true

# Проверяем обязательные переменные окружения
echo "Проверка переменных окружения:"
echo "  SECRET_KEY: ${SECRET_KEY:+установлен} ${SECRET_KEY:-НЕ УСТАНОВЛЕН!}"
echo "  POSTGRESQL_HOST: ${POSTGRESQL_HOST:+установлен} ${POSTGRESQL_HOST:-не установлен}"
echo "  DATABASE_URL: ${DATABASE_URL:+установлен} ${DATABASE_URL:-не установлен}"
echo "  PORT: ${PORT:-8000 (по умолчанию)}"

# Запускаем Backend с выводом логов
echo "Запуск: python run.py"
echo "Backend PORT: ${BACKEND_PORT:-${PORT:-8000}}"
# Устанавливаем PORT для backend
export PORT=${BACKEND_PORT:-${PORT:-8000}}
# Запускаем в фоне, но перенаправляем вывод в stdout/stderr
python run.py > /proc/1/fd/1 2>/proc/1/fd/2 &
BACKEND_PID=$!
echo "Backend запущен с PID: $BACKEND_PID на порту $PORT"

# Выводим информацию о процессе
sleep 2
ps aux | grep python | grep -v grep || echo "Процесс Python не найден"

# Ждем немного и проверяем, что процесс запустился
sleep 5

if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "=========================================="
    echo "ОШИБКА: Backend процесс завершился!"
    echo "=========================================="
    echo "Попытка запуска Backend напрямую для диагностики..."
    cd /app/backend
    echo "Текущая директория: $(pwd)"
    echo "Содержимое:"
    ls -la || true
    echo "Проверка Python модулей:"
    python -c "import sys; print('Python:', sys.version)" || true
    python -c "import uvicorn; print('uvicorn OK')" || echo "uvicorn НЕ найден!"
    python -c "from backend import main; print('main OK')" 2>&1 || echo "Ошибка импорта main"
    echo "Запуск напрямую:"
    python run.py 2>&1 || true
    echo "Backend завершился с кодом: $?"
    echo "=========================================="
    exit 1
fi

echo "✓ Backend успешно запущен"

echo "=========================================="
echo "=== Запуск Frontend на порту 3000 ==="
echo "=========================================="

# Переходим в корневую директорию
cd /app || { echo "ОШИБКА: Директория /app не найдена!"; exit 1; }

# Запускаем Frontend
# Устанавливаем PORT для frontend (отдельно от backend)
export PORT=${FRONTEND_PORT:-3000}
if [ -f "server.js" ]; then
    echo "Запуск: node server.js"
    echo "Frontend PORT: $PORT"
    echo "HOSTNAME: ${HOSTNAME:-0.0.0.0}"
    HOSTNAME=${HOSTNAME:-0.0.0.0} node server.js > /proc/1/fd/1 2>/proc/1/fd/2 &
else
    echo "Запуск: npm start"
    echo "Frontend PORT: $PORT"
    HOSTNAME=${HOSTNAME:-0.0.0.0} npm start > /proc/1/fd/1 2>/proc/1/fd/2 &
fi
FRONTEND_PID=$!
echo "Frontend запущен с PID: $FRONTEND_PID"

# Ждем и проверяем Frontend
sleep 5
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "ОШИБКА: Frontend процесс завершился!"
    echo "Проверка портов:"
    netstat -tlnp 2>/dev/null || ss -tlnp 2>/dev/null || echo "Не удалось проверить порты"
    exit 1
fi

# Проверяем, что порт слушается
echo "Проверка портов:"
netstat -tlnp 2>/dev/null | grep -E ":(3000|8000)" || ss -tlnp 2>/dev/null | grep -E ":(3000|8000)" || echo "Проверка портов недоступна"

echo "✓ Frontend успешно запущен"
echo "=========================================="
echo "Оба сервиса запущены и работают"
echo "=========================================="

# Функция для корректного завершения
cleanup() {
    echo "Получен сигнал остановки..."
    echo "Остановка Backend (PID: $BACKEND_PID)..."
    kill $BACKEND_PID 2>/dev/null || true
    echo "Остановка Frontend (PID: $FRONTEND_PID)..."
    kill $FRONTEND_PID 2>/dev/null || true
    wait
    echo "Сервисы остановлены"
    exit 0
}

# Обработка сигналов
trap cleanup SIGTERM SIGINT

# Ожидание завершения любого из процессов
wait $BACKEND_PID $FRONTEND_PID

