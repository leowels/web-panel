# Dockerfile для полного приложения (Frontend + Backend)
FROM node:18-alpine AS frontend-base

# Установка зависимостей Frontend
FROM frontend-base AS frontend-deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Сборка Frontend
FROM frontend-base AS frontend-builder
WORKDIR /app
COPY --from=frontend-deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Backend builder
FROM python:3.11-slim AS backend-builder
WORKDIR /app/backend

# Установка системных зависимостей для компиляции
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Установка Python зависимостей
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Production образ
FROM python:3.11-slim AS runner
WORKDIR /app

# Установка runtime зависимостей
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Копируем Python пакеты из builder (до создания пользователя)
COPY --from=backend-builder /root/.local /root/.local
RUN chown -R appuser:appuser /root/.local 2>/dev/null || true

# Копируем Frontend
COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder /app/.next/standalone ./
COPY --from=frontend-builder /app/.next/static ./.next/static

# Копируем Backend (сохраняем структуру)
COPY backend/ ./backend/
RUN ls -la /app/backend/ || true

# Скрипт запуска обоих сервисов (копируем до создания пользователя)
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Создаем пользователя
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
# Копируем Python пакеты в домашнюю директорию пользователя
RUN cp -r /root/.local /home/appuser/.local 2>/dev/null || true && \
    chown -R appuser:appuser /home/appuser/.local 2>/dev/null || true
USER appuser

# Порты
EXPOSE 3000 8000

# Переменные окружения
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV PATH=/home/appuser/.local/bin:$PATH

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/docker-entrypoint.sh"]
