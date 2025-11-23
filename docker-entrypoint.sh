#!/bin/sh

# Функция для вывода с временной меткой
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "🚀 Запуск приложения..."

# Функция для остановки процессов
cleanup() {
    log "🛑 Получен сигнал остановки, завершаем процессы..."
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    exit 0
}

# Обработка сигналов (совместимо с /bin/sh)
trap 'cleanup' 15 2

# Запуск Backend
log "📦 Запуск Backend на порту ${BACKEND_PORT:-8000}..."
cd /app/backend
export PORT=${BACKEND_PORT:-8000}
python run.py > /proc/1/fd/1 2>&1 &
BACKEND_PID=$!

# Ждем запуска Backend
sleep 3

# Проверка Backend
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    log "❌ Backend не запустился!"
    exit 1
fi

log "✅ Backend запущен (PID: $BACKEND_PID)"

# Запуск Frontend
log "🎨 Запуск Frontend на порту ${FRONTEND_PORT:-3000}..."
cd /app
export PORT=${FRONTEND_PORT:-3000}
export HOSTNAME="0.0.0.0"
export NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:8000}
# Проверяем наличие server.js
if [ ! -f "server.js" ]; then
    log "❌ server.js не найден! Проверка содержимого /app:"
    ls -la /app | head -20
    exit 1
fi
node server.js > /proc/1/fd/1 2>&1 &
FRONTEND_PID=$!

# Ждем запуска Frontend
sleep 2

# Проверка Frontend
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    log "❌ Frontend не запустился!"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

log "✅ Frontend запущен (PID: $FRONTEND_PID)"
log "🎉 Приложение запущено!"
log "   Frontend: http://0.0.0.0:${FRONTEND_PORT:-3000}"
log "   Backend:  http://0.0.0.0:${BACKEND_PORT:-8000}"

# Ожидание завершения
wait $BACKEND_PID $FRONTEND_PID

