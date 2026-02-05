#!/bin/sh

# Функция для вывода с временной меткой
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

health_ok() {
    curl -f -s "http://localhost:${BACKEND_PORT:-8000}/health" > /dev/null 2>&1 || \
    curl -f -s "http://localhost:${BACKEND_PORT:-8000}/api/health" > /dev/null 2>&1
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

# Проверка доступности Python и модулей
log "🔍 Проверка окружения..."
which python3 || which python || (log "❌ Python не найден!" && exit 1)
python3 --version || python --version || true
log "PATH: $PATH"
# Устанавливаем PYTHONPATH для поиска модулей в .local
export PYTHONPATH=/home/appuser/.local/lib/python3.11/site-packages:$PYTHONPATH
log "PYTHONPATH: $PYTHONPATH"

# Запуск Backend
log "📦 Запуск Backend на порту ${BACKEND_PORT:-8000}..."
cd /app/backend
export PORT=${BACKEND_PORT:-8000}
# Используем python3, если доступен, иначе python
PYTHON_CMD=$(which python3 2>/dev/null || which python 2>/dev/null || echo "python3")
log "Используется Python: $PYTHON_CMD"
$PYTHON_CMD --version || true
$PYTHON_CMD -c "import sys; print('Python path:', sys.path)" || true
$PYTHON_CMD run.py > /proc/1/fd/1 2>&1 &
BACKEND_PID=$!

# Ждем запуска Backend и проверяем готовность
log "⏳ Ожидание готовности Backend..."
BACKEND_READY=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    sleep 2
    # Проверяем, что процесс еще работает
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        log "❌ Backend процесс завершился!"
        exit 1
    fi
    # Проверяем, что Backend отвечает на health check
    if health_ok; then
        BACKEND_READY=1
        log "✅ Backend готов и отвечает на запросы!"
        break
    fi
    log "⏳ Попытка $i/20: Backend еще не готов..."
done

if [ $BACKEND_READY -eq 0 ]; then
    log "❌ Backend не отвечает после 40 секунд ожидания!"
    log "Проверка процесса:"
    ps aux | grep python | grep -v grep || true
    log "Проверка порта:"
    netstat -tlnp 2>/dev/null | grep ${BACKEND_PORT:-8000} || ss -tlnp 2>/dev/null | grep ${BACKEND_PORT:-8000} || true
    log "Последние строки логов (если доступны):"
    tail -20 /proc/1/fd/1 2>/dev/null || true
    log "Проверка доступности Python модулей:"
    $PYTHON_CMD -c "import uvicorn; print('uvicorn OK')" 2>&1 || log "⚠️ uvicorn не найден"
    $PYTHON_CMD -c "import sys; sys.path.insert(0, '/app/backend'); from main import app; print('main import OK')" 2>&1 || log "⚠️ main import failed"
    exit 1
fi

log "✅ Backend запущен и готов (PID: $BACKEND_PID)"

# Запуск Frontend
log "🎨 Запуск Frontend на порту ${FRONTEND_PORT:-3000}..."
cd /app
export PORT=${FRONTEND_PORT:-3000}
export HOSTNAME="0.0.0.0"
export NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:8000}
# Проверяем наличие server.js и структуру
if [ ! -f "server.js" ]; then
    log "❌ server.js не найден! Проверка содержимого /app:"
    ls -la /app | head -20
    log "Проверка .next директории:"
    ls -la .next 2>/dev/null || echo ".next не найден"
    exit 1
fi
# Проверяем наличие статических файлов и public
log "Проверка структуры Frontend:"
ls -la /app | grep -E "(server.js|public|\.next)" || true
if [ -d ".next/static" ]; then
    log "✅ .next/static найден"
else
    log "⚠️ .next/static не найден, ищем статические файлы:"
    find . -name "static" -type d 2>/dev/null | head -5 || true
fi
if [ -d "public" ]; then
    log "✅ public директория найдена"
else
    log "⚠️ public директория не найдена"
fi
log "Запуск Next.js server..."
node server.js > /proc/1/fd/1 2>&1 &
FRONTEND_PID=$!

# Ждем запуска Frontend и проверяем готовность
log "⏳ Ожидание готовности Frontend..."
FRONTEND_READY=0
for i in 1 2 3 4 5; do
    sleep 2
    # Проверяем, что процесс еще работает
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        log "❌ Frontend процесс завершился!"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
    # Проверяем, что Frontend отвечает
    if curl -f -s http://localhost:${FRONTEND_PORT:-3000}/ > /dev/null 2>&1; then
        FRONTEND_READY=1
        log "✅ Frontend готов и отвечает на запросы!"
        break
    fi
    log "⏳ Попытка $i/5: Frontend еще не готов..."
done

if [ $FRONTEND_READY -eq 0 ]; then
    log "⚠️ Frontend еще не отвечает, но процесс работает. Продолжаем..."
fi

log "✅ Frontend запущен (PID: $FRONTEND_PID)"
log "🎉 Приложение запущено!"
log "   Frontend: http://0.0.0.0:${FRONTEND_PORT:-3000}"
log "   Backend:  http://0.0.0.0:${BACKEND_PORT:-8000}"

# Ожидание завершения процессов
# Используем wait для корректного ожидания завершения дочерних процессов
wait $BACKEND_PID $FRONTEND_PID
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    log "❌ Один из процессов завершился с ошибкой (код: $EXIT_CODE)"
    exit $EXIT_CODE
fi
