# Dockerfile для FastAPI Backend (оптимизированный)
FROM python:3.11-slim AS builder

WORKDIR /app

# Установка только необходимых зависимостей для компиляции
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Копируем и устанавливаем зависимости
COPY backend/requirements.txt ./backend/requirements.txt
WORKDIR /app/backend
RUN pip install --no-cache-dir --user -r requirements.txt

# Production образ (минимальный)
FROM python:3.11-slim

WORKDIR /app

# Установка только runtime зависимостей (без компилятора)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Копируем установленные пакеты из builder
COPY --from=builder /root/.local /root/.local

# Копируем код приложения
COPY backend/ ./backend/

# Создаем пользователя для безопасности
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
# Копируем пакеты в доступное место для пользователя
RUN cp -r /root/.local /home/appuser/.local 2>/dev/null || true && \
    chown -R appuser:appuser /home/appuser/.local 2>/dev/null || true

USER appuser

# Порт
EXPOSE 8000

# Переменные окружения
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV PATH=/home/appuser/.local/bin:$PATH

# Рабочая директория - backend
WORKDIR /app/backend

# Запуск сервера (run.py уже настроен для работы из /app/backend)
CMD ["python", "run.py"]
