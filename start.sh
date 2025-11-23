#!/bin/sh
# Простой скрипт запуска для Timeweb Cloud

# Запускаем Backend в фоне
cd /app/backend
python run.py &
BACKEND_PID=$!

# Ждем немного для запуска Backend
sleep 3

# Запускаем Frontend
cd /app
PORT=${FRONTEND_PORT:-3000} node server.js

