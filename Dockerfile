# Production Dockerfile for InspectorHub.
# NOTE: Keep this file deploy-ready because many CI/CD platforms use root Dockerfile by default.

# ============================================
# Stage 1: Frontend Build
# ============================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --silent

COPY . .

ENV NEXT_PUBLIC_API_URL=
ENV BACKEND_URL=http://127.0.0.1:8000
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ============================================
# Stage 2: Backend Dependencies
# ============================================
FROM python:3.11-slim AS backend-builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ============================================
# Stage 3: Runtime Image
# ============================================
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend-builder /opt/venv /opt/venv
COPY backend/ ./backend/
COPY ENV_DOCKER.txt /app/backend/ENV_BACKEND.txt
COPY ENV_FRONTEND.txt /app/ENV_FRONTEND.txt
COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder /app/.next/standalone ./
COPY --from=frontend-builder /app/.next/static ./.next/static

COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV BACKEND_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_URL=
ENV VIRTUAL_ENV=/opt/venv
ENV PATH=/opt/venv/bin:/home/appuser/.local/bin:$PATH
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
    CMD curl -f http://localhost:${FRONTEND_PORT:-${PORT:-3000}}/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
