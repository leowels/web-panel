#!/bin/sh

set -eu

export LANG="${LANG:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

cleanup() {
  log "Stopping child processes..."
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "${FRONTEND_PID:-}" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  exit 0
}

trap cleanup INT TERM

trim() {
  # shellcheck disable=SC2001
  printf "%s" "$1" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//"
}

strip_wrapping_quotes() {
  value="$1"
  case "$value" in
    \"*\")
      value="${value#\"}"
      value="${value%\"}"
      ;;
    \'*\')
      value="${value#\'}"
      value="${value%\'}"
      ;;
  esac
  printf "%s" "$value"
}

load_env_file_if_exists() {
  env_file="$1"
  if [ ! -f "$env_file" ]; then
    return
  fi

  log "Loading env defaults from $env_file (without overriding provided env vars)"
  while IFS= read -r raw_line || [ -n "$raw_line" ]; do
    line="$(trim "${raw_line%$'\r'}")"
    case "$line" in
      ""|\#*)
        continue
        ;;
    esac

    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"
    [ -n "$key" ] || continue

    case "$key" in
      *[!A-Za-z0-9_]*)
        continue
        ;;
    esac

    eval "existing_value=\${$key:-}"
    if [ -n "$existing_value" ]; then
      continue
    fi

    value="$(strip_wrapping_quotes "$value")"
    export "$key=$value"
  done < "$env_file"
}

wait_for_postgres_if_configured() {
  if [ -n "${DATABASE_URL:-}" ]; then
    case "$DATABASE_URL" in
      postgresql://*|postgresql+asyncpg://*)
        log "DATABASE_URL is set; skipping POSTGRESQL_HOST preflight"
        return
        ;;
      *)
        return
        ;;
    esac
  fi

  if [ -z "${POSTGRESQL_HOST:-}" ]; then
    return
  fi

  db_port="${POSTGRESQL_PORT:-5432}"
  db_wait_attempts="${DB_WAIT_ATTEMPTS:-60}"

  log "Checking PostgreSQL TCP connection at ${POSTGRESQL_HOST}:${db_port}..."
  i=1
  while [ "$i" -le "$db_wait_attempts" ]; do
    if "$PYTHON_CMD" -c "import os, socket; s=socket.socket(); s.settimeout(3); s.connect((os.environ['POSTGRESQL_HOST'], int(os.environ.get('POSTGRESQL_PORT', '5432')))); s.close()" >/dev/null 2>&1; then
      log "PostgreSQL TCP connection is available"
      return
    fi

    if [ $((i % 10)) -eq 0 ]; then
      log "Waiting for PostgreSQL... attempt $i/$db_wait_attempts"
    fi

    sleep 2
    i=$((i + 1))
  done

  log "ERROR: PostgreSQL is not reachable at ${POSTGRESQL_HOST}:${db_port}"
  log "ERROR: Check Timeweb private network, DB host/port, firewall, and POSTGRESQL_SSL value"
  exit 1
}

log "Starting InspectorHub container..."

load_env_file_if_exists "/app/backend/ENV_BACKEND.txt"
load_env_file_if_exists "/app/backend/.env"

if [ -z "${SECRET_KEY:-}" ]; then
  log "WARNING: SECRET_KEY is not set"
fi

if [ -z "${DATABASE_URL:-}" ] && [ -z "${POSTGRESQL_HOST:-}" ]; then
  log "WARNING: DATABASE_URL and POSTGRESQL_HOST are not set, fallback DB config will be used"
fi

PYTHON_CMD="$(command -v python3 || command -v python)"
if [ -z "$PYTHON_CMD" ]; then
  log "ERROR: Python runtime not found"
  exit 1
fi

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-${PORT:-3000}}"
export VIRTUAL_ENV="${VIRTUAL_ENV:-/opt/venv}"
export PATH="${VIRTUAL_ENV}/bin:/home/appuser/.local/bin:${PATH}"
export PYTHONPATH="${VIRTUAL_ENV}/lib/python3.11/site-packages:/home/appuser/.local/lib/python3.11/site-packages:${PYTHONPATH:-}"

log "Python: $PYTHON_CMD"
"$PYTHON_CMD" --version || true

wait_for_postgres_if_configured

log "Starting backend on port $BACKEND_PORT..."
cd /app/backend
export PORT="$BACKEND_PORT"
"$PYTHON_CMD" run.py > /proc/1/fd/1 2>&1 &
BACKEND_PID=$!

backend_ready=0
backend_wait_attempts="${BACKEND_WAIT_ATTEMPTS:-90}"
i=1
while [ "$i" -le "$backend_wait_attempts" ]; do
  sleep 2
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    log "ERROR: backend process exited"
    exit 1
  fi
  if curl -fsS "http://localhost:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
    backend_ready=1
    break
  fi
  if [ $((i % 10)) -eq 0 ]; then
    log "Waiting for backend health check... attempt $i/$backend_wait_attempts"
  fi
  i=$((i + 1))
done

if [ "$backend_ready" -ne 1 ]; then
  log "ERROR: backend health check failed"
  exit 1
fi

log "Backend is healthy (PID: $BACKEND_PID)"

log "Starting frontend on port $FRONTEND_PORT..."
cd /app
export PORT="$FRONTEND_PORT"
export HOSTNAME="0.0.0.0"
export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:${BACKEND_PORT}}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-}"

if [ ! -f "/app/server.js" ]; then
  log "ERROR: /app/server.js not found"
  exit 1
fi

node server.js > /proc/1/fd/1 2>&1 &
FRONTEND_PID=$!

frontend_ready=0
i=1
while [ "$i" -le 30 ]; do
  sleep 2
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log "ERROR: frontend process exited"
    kill "$BACKEND_PID" 2>/dev/null || true
    exit 1
  fi
  if curl -fsS "http://localhost:${FRONTEND_PORT}/" >/dev/null 2>&1; then
    frontend_ready=1
    break
  fi
  i=$((i + 1))
done

if [ "$frontend_ready" -ne 1 ]; then
  log "WARNING: frontend health check did not pass in time, continuing"
fi

log "Frontend started (PID: $FRONTEND_PID)"
log "Service endpoints:"
log "  Frontend: http://0.0.0.0:${FRONTEND_PORT}"
log "  Backend:  http://0.0.0.0:${BACKEND_PORT}"

wait "$BACKEND_PID" "$FRONTEND_PID"
