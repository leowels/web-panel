#!/bin/sh
set -e

echo "Запуск Backend на порту 8000..."
cd /app/backend
python run.py &
BACKEND_PID=$!

# Небольшая задержка для запуска Backend
sleep 2

echo "Запуск Frontend на порту 3000..."
cd /app
if [ -f "server.js" ]; then
    node server.js &
else
    npm start &
fi
FRONTEND_PID=$!

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

