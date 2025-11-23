#!/bin/sh
set -e

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

# Запускаем Backend
echo "Запуск: python run.py"
python run.py &
BACKEND_PID=$!
echo "Backend запущен с PID: $BACKEND_PID"

# Ждем немного и проверяем, что процесс запустился
sleep 5

if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "ОШИБКА: Backend процесс завершился!"
    echo "Проверьте логи выше на наличие ошибок"
    exit 1
fi

echo "✓ Backend успешно запущен"

echo "=========================================="
echo "=== Запуск Frontend на порту 3000 ==="
echo "=========================================="

# Переходим в корневую директорию
cd /app || { echo "ОШИБКА: Директория /app не найдена!"; exit 1; }

# Запускаем Frontend
if [ -f "server.js" ]; then
    echo "Запуск: node server.js"
    node server.js &
else
    echo "Запуск: npm start"
    npm start &
fi
FRONTEND_PID=$!
echo "Frontend запущен с PID: $FRONTEND_PID"

# Ждем и проверяем Frontend
sleep 3
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "ОШИБКА: Frontend процесс завершился!"
    exit 1
fi

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

