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
COPY requirements.txt .
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
COPY . .

# Создаем пользователя для безопасности
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Порт
EXPOSE 8000

# Переменные окружения
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV PATH=/root/.local/bin:$PATH

# Запуск сервера
CMD ["python", "run.py"]

