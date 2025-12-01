# Multi-stage build для Frontend + Backend

# ============================================
# Stage 1: Frontend Build
# ============================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Установка зависимостей Frontend
COPY package.json package-lock.json* ./
RUN npm ci

# Копируем все файлы для сборки
COPY . .

# Build arguments для Next.js
# НЕ устанавливаем NEXT_PUBLIC_API_URL - используем относительный путь через прокси
ARG BACKEND_URL=http://localhost:8000
ENV BACKEND_URL=${BACKEND_URL}
ENV NEXT_TELEMETRY_DISABLED=1

# Сборка Frontend
RUN npm run build

# ============================================
# Stage 2: Backend Dependencies
# ============================================
FROM python:3.11-slim AS backend-builder

WORKDIR /app

# Установка системных зависимостей для компиляции и OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libpq-dev \
    tesseract-ocr \
    tesseract-ocr-rus \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Установка Python зависимостей
COPY backend/requirements.txt ./backend/requirements.txt
WORKDIR /app/backend
RUN pip install --no-cache-dir --user -r requirements.txt

# ============================================
# Stage 3: Production Image
# ============================================
FROM python:3.11-slim

WORKDIR /app

# Установка runtime зависимостей (включая Node.js для Frontend, curl и Tesseract OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    gnupg \
    tesseract-ocr \
    tesseract-ocr-rus \
    tesseract-ocr-eng \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Копируем Python пакеты из builder
COPY --from=backend-builder /root/.local /root/.local

# Копируем Backend код
COPY backend/ ./backend/

# Копируем Frontend (standalone)
# В standalone режиме Next.js создает структуру с server.js в корне
COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder /app/.next/standalone ./
# Статические файлы должны быть в .next/static относительно server.js
COPY --from=frontend-builder /app/.next/static ./.next/static
# Также копируем .next/static в standalone/.next/static (на случай если server.js в standalone/)
RUN mkdir -p ./.next && cp -r ./.next/static ./.next/ 2>/dev/null || true

# Копируем entrypoint скрипт
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Создаем пользователя
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app && \
    cp -r /root/.local /home/appuser/.local 2>/dev/null || true && \
    chown -R appuser:appuser /home/appuser/.local 2>/dev/null || true

USER appuser

# Порты
EXPOSE 3000 8000

# Health check для Timeweb Cloud
# Проверяем Backend (основной сервис) - Frontend может запускаться дольше
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Переменные окружения
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV PATH=/home/appuser/.local/bin:$PATH

# Запуск через entrypoint
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/docker-entrypoint.sh"]

