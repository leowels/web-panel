#!/bin/sh
set -e

echo "=== Запуск Backend на порту 8000 ==="
cd /app/backend
python run.py > /proc/1/fd/1 2>&1 &
BACKEND_PID=$!
echo "Backend запущен с PID: $BACKEND_PID"

# Небольшая задержка для запуска Backend
sleep 3

# Проверка, что Backend запустился
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "ОШИБКА: Backend не запустился!"
    exit 1
fi

echo "=== Запуск Frontend на порту 3000 ==="
cd /app
if [ -f "server.js" ]; then
    node server.js > /proc/1/fd/1 2>&1 &
else
    npm start > /proc/1/fd/1 2>&1 &
fi
FRONTEND_PID=$!
echo "Frontend запущен с PID: $FRONTEND_PID"

# Функция для корректного завершения
cleanup() {
    echo "Остановка сервисов..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait
    exit 0
}

# Обработка сигналов
trap cleanup SIGTERM SIGINT

# Ожидание завершения
wait $BACKEND_PID $FRONTEND_PID

