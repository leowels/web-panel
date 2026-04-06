from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse
from contextlib import asynccontextmanager
import os
import sys
import logging
import httpx
import asyncio
from datetime import datetime
from pathlib import Path
import uuid
from sqlalchemy.exc import SQLAlchemyError, TimeoutError as SQLAlchemyTimeoutError, OperationalError, DBAPIError

# Р—Р°РіСЂСѓР¶Р°РµРј РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ РёР· .env С„Р°Р№Р»Р° Р”Рћ РІСЃРµС… РёРјРїРѕСЂС‚РѕРІ
# Р­С‚Рѕ РєСЂРёС‚РёС‡РЅРѕ, С‚Р°Рє РєР°Рє auth.py РїСЂРѕРІРµСЂСЏРµС‚ SECRET_KEY РїСЂРё РёРјРїРѕСЂС‚Рµ
backend_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(backend_dir)
env_paths = [
    os.path.join(backend_dir, ".env"),
    os.path.join(backend_dir, "ENV_BACKEND.txt"),
    os.path.join(parent_dir, ".env"),
]

try:
    from dotenv import load_dotenv
    loaded = False
    for env_path in env_paths:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=False)
            print(f"[INFO] Р—Р°РіСЂСѓР¶РµРЅС‹ РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ РёР·: {env_path}")
            loaded = True
            break
    if not loaded:
        print(f"[WARNING] Р¤Р°Р№Р»С‹ СЃ РїРµСЂРµРјРµРЅРЅС‹РјРё РѕРєСЂСѓР¶РµРЅРёСЏ РЅРµ РЅР°Р№РґРµРЅС‹. РџСЂРѕРІРµСЂСЏР»РёСЃСЊ РїСѓС‚Рё: {env_paths}")
        print(f"[INFO] SECRET_KEY РёР· РѕРєСЂСѓР¶РµРЅРёСЏ: {'СѓСЃС‚Р°РЅРѕРІР»РµРЅ' if os.getenv('SECRET_KEY') else 'РќР• СѓСЃС‚Р°РЅРѕРІР»РµРЅ'}")
except ImportError:
    print("[WARNING] python-dotenv РЅРµ СѓСЃС‚Р°РЅРѕРІР»РµРЅ, РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ РЅРµ Р·Р°РіСЂСѓР¶РµРЅС‹ РёР· С„Р°Р№Р»Р°")

# РќР°СЃС‚СЂРѕР№РєР° Р»РѕРіРёСЂРѕРІР°РЅРёСЏ СЃ РІСЂРµРјРµРЅРЅС‹РјРё РјРµС‚РєР°РјРё
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# РџРѕРґРґРµСЂР¶РєР° Р·Р°РїСѓСЃРєР° РєР°Рє СЃРєСЂРёРїС‚Р° Рё РєР°Рє РјРѕРґСѓР»СЏ
try:
    # РџСЂРѕР±СѓРµРј Р°Р±СЃРѕР»СЋС‚РЅС‹Рµ РёРјРїРѕСЂС‚С‹ (РґР»СЏ uvicorn С‡РµСЂРµР· run.py)
    from backend.database import init_db, engine, async_session
    from backend.models import Base, User, Role, UserRole
    from backend.utils import get_password_hash, verify_password
    from backend.routers import users, auth
except ImportError:
    try:
        # РџСЂРѕР±СѓРµРј РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Рµ РёРјРїРѕСЂС‚С‹ (РґР»СЏ uvicorn РЅР°РїСЂСЏРјСѓСЋ)
        from .database import init_db, engine, async_session
        from .models import Base, User, Role, UserRole
        from .utils import get_password_hash, verify_password
        from .routers import users, auth
    except ImportError:
        # Р•СЃР»Рё РЅРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ, РїСЂРѕР±СѓРµРј Р°Р±СЃРѕР»СЋС‚РЅС‹Рµ (РґР»СЏ РїСЂСЏРјРѕРіРѕ Р·Р°РїСѓСЃРєР°)
        from database import init_db, engine, async_session
        from models import Base, User, Role, UserRole
        from utils import get_password_hash, verify_password
        from routers import users, auth

try:
    from backend.alert_engine import run_sla_alert_cycle
except ImportError:
    try:
        from .alert_engine import run_sla_alert_cycle
    except ImportError:
        run_sla_alert_cycle = None

try:
    from backend.error_monitor import capture_error_event
except ImportError:
    try:
        from .error_monitor import capture_error_event
    except ImportError:
        capture_error_event = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    sla_task = None
    logger = logging.getLogger(__name__)
    
    # РЎРѕР·РґР°РЅРёРµ СЂРѕР»РµР№ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy import select
    
    async with AsyncSession(engine) as session:
        # РџСЂРѕРІРµСЂРєР° СЃСѓС‰РµСЃС‚РІРѕРІР°РЅРёСЏ СЂРѕР»РµР№
        result = await session.execute(select(Role))
        existing_roles = result.scalars().all()
        
        if not existing_roles:
            roles_data = [
                {"name": "admin", "description": "РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ", "permissions": ["*"]},
                {"name": "manager", "description": "Менеджер", "permissions": [
                    "equipment:read",
                    "violations:read",
                    "inspections:read",
                    "acts:read",
                    "checklists:read",
                    "knowledge:read",
                    "files:read",
                    "audit:read",
                    "settings:read",
                    "users:read",
                    "reports:read",
                    "reports:export",
                    "analytics:read"
                ]},
                {"name": "inspector", "description": "РРЅСЃРїРµРєС‚РѕСЂ", "permissions": [
                    "inspections:*", 
                    "equipment:read", 
                    "equipment:create",
                    "equipment:update",
                    "violations:*", 
                    "acts:read",
                    "acts:create",
                    "acts:update",
                    "checklists:read",
                    "checklists:create",
                    "knowledge:read",
                    "files:read",
                    "files:create",
                    "audit:read",
                    "settings:read",
                    "users:read",
                    "reports:read"
                ]},
                {"name": "operator", "description": "РћРїРµСЂР°С‚РѕСЂ", "permissions": [
                    "equipment:read",
                    "equipment:create",
                    "inspections:read",
                    "inspections:create",
                    "violations:read",
                    "violations:create",
                    "acts:read",
                    "checklists:read",
                    "knowledge:read",
                    "files:read",
                    "files:create"
                ]},
                {"name": "auditor", "description": "РђСѓРґРёС‚РѕСЂ", "permissions": [
                    "equipment:read",
                    "inspections:read",
                    "violations:read",
                    "acts:read",
                    "checklists:read",
                    "knowledge:read",
                    "files:read",
                    "audit:read",
                    "reports:read",
                    "reports:export",
                    "settings:read"
                ]},
                {"name": "viewer", "description": "РџСЂРѕСЃРјРѕС‚СЂ", "permissions": [
                    "equipment:read", 
                    "inspections:read",
                    "violations:read",
                    "acts:read",
                    "tasks:read",
                    "files:read",
                    "checklists:read",
                    "knowledge:read"
                ]},
            ]
            
            for role_data in roles_data:
                role = Role(**role_data)
                session.add(role)
            
            await session.commit()

        # Для уже существующей БД синхронизируем минимальные read-права viewer.
        viewer_result = await session.execute(select(Role).where(Role.name == "viewer"))
        viewer_role = viewer_result.scalar_one_or_none()
        if viewer_role:
            required_viewer_permissions = {
                "equipment:read",
                "inspections:read",
                "violations:read",
                "acts:read",
                "tasks:read",
                "files:read",
                "checklists:read",
                "knowledge:read",
            }
            current_permissions = set(viewer_role.permissions or [])
            missing_permissions = sorted(required_viewer_permissions - current_permissions)
            if missing_permissions:
                viewer_role.permissions = sorted(current_permissions | required_viewer_permissions)
                session.add(viewer_role)
                await session.commit()
                logger.info("Viewer role permissions synced, added: %s", ", ".join(missing_permissions))
        
        # РЎРѕР·РґР°РЅРёРµ Р°РґРјРёРЅР° РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ
        result = await session.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()
        
        admin_password_from_env = os.getenv("ADMIN_PASSWORD")
        admin_password = admin_password_from_env or "admin123"
        admin_force_reset = os.getenv("ADMIN_FORCE_RESET_PASSWORD", "false").strip().lower() == "true"
        
        if not admin:
            logger.info("РЎРѕР·РґР°РЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ admin...")
            admin = User(
                username="admin",
                email="admin@inspectorhub.ru",
                hashed_password=get_password_hash(admin_password),
                full_name="РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ",
                is_active=True
            )
            session.add(admin)
            await session.flush()
            
            # РќР°Р·РЅР°С‡РµРЅРёРµ СЂРѕР»Рё Р°РґРјРёРЅР°
            admin_role = await session.execute(select(Role).where(Role.name == "admin"))
            role = admin_role.scalar_one()
            
            user_role = UserRole(user_id=admin.id, role_id=role.id)
            session.add(user_role)
            await session.commit()
            logger.info(f"вњ“ РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ admin СЃРѕР·РґР°РЅ. РџР°СЂРѕР»СЊ: {'СѓСЃС‚Р°РЅРѕРІР»РµРЅ РёР· ADMIN_PASSWORD' if os.getenv('ADMIN_PASSWORD') else 'admin123 (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ)'}")
        else:
            if admin_password_from_env and admin_force_reset:
                if not verify_password(admin_password, admin.hashed_password):
                    admin.hashed_password = get_password_hash(admin_password)
                    session.add(admin)
                    await session.commit()
                    logger.info("Admin password updated from ADMIN_PASSWORD (forced by ADMIN_FORCE_RESET_PASSWORD=true)")
                else:
                    logger.info("Admin password reset requested, but current password is already up to date")
            logger.info("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ admin СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚")
    
    if run_sla_alert_cycle and os.getenv("ENABLE_SLA_ALERT_ENGINE", "true").lower() == "true":
        interval_seconds = int(os.getenv("SLA_ALERT_CHECK_INTERVAL_SECONDS", "600"))
        logger = logging.getLogger(__name__)

        async def _sla_alert_worker():
            while True:
                try:
                    async with async_session() as db:
                        await run_sla_alert_cycle(db)
                except Exception as exc:
                    logger.warning("SLA alert cycle failed: %s", exc)
                await asyncio.sleep(max(60, interval_seconds))

        sla_task = asyncio.create_task(_sla_alert_worker())
        logger.info("SLA alert engine started (interval=%ss)", interval_seconds)

    yield
    
    # Shutdown
    if sla_task:
        sla_task.cancel()
        try:
            await sla_task
        except asyncio.CancelledError:
            pass
    await engine.dispose()

app = FastAPI(
    title="InspectorHub API",
    description="РџСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅР°СЏ СЃРёСЃС‚РµРјР° СѓРїСЂР°РІР»РµРЅРёСЏ РёРЅСЃРїРµРєС†РёСЏРјРё Рё РєРѕРЅС‚СЂРѕР»РµРј",
    version="1.0.0",
    lifespan=lifespan
)


def _build_error_payload(
    *,
    code: str,
    message: str,
    trace_id: str,
    retryable: bool,
    status_code: int,
):
    # Keep legacy fields to avoid breaking existing frontend parsers.
    return {
        "error": {
            "code": code,
            "message": message,
            "trace_id": trace_id,
            "retryable": retryable,
            "status_code": status_code,
            "timestamp": datetime.utcnow().isoformat(),
        },
        "detail": message,
        "trace_id": trace_id,
    }


@app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    trace_id = request.headers.get("x-trace-id") or str(uuid.uuid4())
    request.state.trace_id = trace_id
    method = request.method.upper()
    is_retryable_method = method in {"GET", "HEAD", "OPTIONS"}
    max_retries = int(os.getenv("DB_TRANSIENT_RETRY_COUNT", "2")) if is_retryable_method else 0

    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            response = await call_next(request)
            content_type = response.headers.get("content-type", "")
            if (
                content_type
                and "charset=" not in content_type.lower()
                and (
                    content_type.startswith("application/json")
                    or content_type.startswith("text/")
                )
            ):
                response.headers["content-type"] = f"{content_type}; charset=utf-8"
            response.headers["x-trace-id"] = trace_id
            return response
        except Exception as exc:
            is_transient = isinstance(
                exc,
                (
                    TimeoutError,
                    ConnectionResetError,
                    asyncio.TimeoutError,
                    SQLAlchemyTimeoutError,
                    OperationalError,
                    DBAPIError,
                ),
            )
            if not is_retryable_method or not is_transient or attempt >= max_retries:
                raise
            last_exc = exc
            logging.getLogger(__name__).warning(
                "Transient request error, retrying (%s/%s), trace_id=%s, path=%s, err=%s",
                attempt + 1,
                max_retries,
                trace_id,
                request.url.path,
                str(exc),
            )
            await asyncio.sleep(0.1 * (attempt + 1))

    if last_exc:
        raise last_exc


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    trace_id = getattr(request.state, "trace_id", str(uuid.uuid4()))
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
    retryable = exc.status_code in (408, 409, 425, 429, 500, 502, 503, 504)
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
        429: "TOO_MANY_REQUESTS",
        500: "INTERNAL_ERROR",
        502: "BAD_GATEWAY",
        503: "SERVICE_UNAVAILABLE",
        504: "GATEWAY_TIMEOUT",
    }
    payload = _build_error_payload(
        code=code_map.get(exc.status_code, "HTTP_ERROR"),
        message=detail,
        trace_id=trace_id,
        retryable=retryable,
        status_code=exc.status_code,
    )
    if capture_error_event and exc.status_code >= 500:
        await capture_error_event(
            code=payload["error"]["code"],
            message=detail,
            trace_id=trace_id,
            path=request.url.path,
            method=request.method,
            status_code=exc.status_code,
            retryable=retryable,
            details={"source": "http_exception_handler"},
        )
    headers = dict(exc.headers or {})
    headers["x-trace-id"] = trace_id
    return JSONResponse(status_code=exc.status_code, content=payload, headers=headers)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    trace_id = getattr(request.state, "trace_id", str(uuid.uuid4()))
    payload = _build_error_payload(
        code="VALIDATION_ERROR",
        message="Validation failed",
        trace_id=trace_id,
        retryable=False,
        status_code=422,
    )
    payload["error"]["validation"] = exc.errors()
    return JSONResponse(status_code=422, content=payload, headers={"x-trace-id": trace_id})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    trace_id = getattr(request.state, "trace_id", str(uuid.uuid4()))
    logging.getLogger(__name__).exception("Unhandled exception (trace_id=%s): %s", trace_id, str(exc))
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError, SQLAlchemyTimeoutError, OperationalError, DBAPIError)):
        payload = _build_error_payload(
            code="DB_TIMEOUT",
            message="Не удалось подключиться к базе данных",
            trace_id=trace_id,
            retryable=True,
            status_code=503,
        )
        if capture_error_event:
            await capture_error_event(
                code="DB_TIMEOUT",
                message=str(exc),
                trace_id=trace_id,
                path=request.url.path,
                method=request.method,
                status_code=503,
                retryable=True,
                details={"source": "unhandled_exception_handler", "type": type(exc).__name__},
            )
        return JSONResponse(status_code=503, content=payload, headers={"x-trace-id": trace_id})

    if isinstance(exc, SQLAlchemyError):
        payload = _build_error_payload(
            code="DB_ERROR",
            message="Ошибка базы данных",
            trace_id=trace_id,
            retryable=True,
            status_code=500,
        )
        if capture_error_event:
            await capture_error_event(
                code="DB_ERROR",
                message=str(exc),
                trace_id=trace_id,
                path=request.url.path,
                method=request.method,
                status_code=500,
                retryable=True,
                details={"source": "unhandled_exception_handler", "type": type(exc).__name__},
            )
        return JSONResponse(status_code=500, content=payload, headers={"x-trace-id": trace_id})

    payload = _build_error_payload(
        code="INTERNAL_ERROR",
        message="Internal server error",
        trace_id=trace_id,
        retryable=True,
        status_code=500,
    )
    if capture_error_event:
        await capture_error_event(
            code="INTERNAL_ERROR",
            message=str(exc),
            trace_id=trace_id,
            path=request.url.path,
            method=request.method,
            status_code=500,
            retryable=True,
            details={"source": "unhandled_exception_handler", "type": type(exc).__name__},
        )
    return JSONResponse(status_code=500, content=payload, headers={"x-trace-id": trace_id})

# CORS - РЅР°СЃС‚СЂРѕР№РєР° С‡РµСЂРµР· РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ РґР»СЏ production
cors_origins_str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,https://leowels-panel.ru")
cors_origins = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# РљРѕСЂРЅРµРІРѕР№ endpoint (РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РґРѕ СЂРµРіРёСЃС‚СЂР°С†РёРё СЂРѕСѓС‚РµСЂРѕРІ РґР»СЏ health checks)
@app.get("/")
async def root():
    return {
        "message": "InspectorHub API",
        "version": "1.0.0",
        "status": "ok",
        "docs": "/docs",
        "health": "/api/health"
    }

# РџРѕРґРєР»СЋС‡РµРЅРёРµ СЂРѕСѓС‚РµСЂРѕРІ
app.include_router(auth.router)
app.include_router(users.router)

# РРјРїРѕСЂС‚ РѕСЃС‚Р°Р»СЊРЅС‹С… СЂРѕСѓС‚РµСЂРѕРІ
try:
    # РџСЂРѕР±СѓРµРј Р°Р±СЃРѕР»СЋС‚РЅС‹Рµ РёРјРїРѕСЂС‚С‹ (РґР»СЏ uvicorn С‡РµСЂРµР· run.py)
    from backend.routers import (
        equipment, checklists, inspections, violations, acts, knowledge, 
        files, settings, audit, documents, tasks, permits, analytics, 
        notifications, reports, alerts, workshop_map, workflow, telegram, defect_nodes
    )
    from backend.routers import passports
    try:
        from backend.routers import ai
    except ImportError:
        ai = None
except ImportError:
    try:
        # РџСЂРѕР±СѓРµРј РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Рµ РёРјРїРѕСЂС‚С‹ (РґР»СЏ uvicorn РЅР°РїСЂСЏРјСѓСЋ)
        from .routers import (
            equipment, checklists, inspections, violations, acts, knowledge,
            files, settings, audit, documents, tasks, permits, analytics,
            notifications, reports, alerts, workshop_map, workflow, telegram, defect_nodes
        )
        from .routers import passports
        try:
            from .routers import ai
        except ImportError:
            ai = None
    except ImportError:
        # РџСЂРѕР±СѓРµРј Р°Р±СЃРѕР»СЋС‚РЅС‹Рµ РёРјРїРѕСЂС‚С‹ (РґР»СЏ РїСЂСЏРјРѕРіРѕ Р·Р°РїСѓСЃРєР°)
        try:
            from routers import (
                equipment, checklists, inspections, violations, acts, knowledge,
                files, settings, audit, documents, tasks, permits, analytics,
                notifications, reports, alerts, workshop_map, workflow, telegram, defect_nodes
            )
            from routers import passports
            try:
                from routers import ai
            except ImportError:
                ai = None
        except ImportError as e:
            import logging
            logging.getLogger(__name__).warning(f"ERROR: Routers not loaded: {e}")
            import traceback
            traceback.print_exc()
            equipment = checklists = inspections = violations = acts = knowledge = files = settings = audit = documents = None
            tasks = permits = analytics = notifications = reports = alerts = workshop_map = workflow = telegram = defect_nodes = None
            passports = None
            ai = None

if equipment:
    app.include_router(equipment.router)
    app.include_router(checklists.router)
    app.include_router(inspections.router)
    app.include_router(violations.router)
    app.include_router(acts.router)
    app.include_router(knowledge.router)
    app.include_router(files.router)
    app.include_router(settings.router)
    app.include_router(audit.router)
    app.include_router(documents.router)
    app.include_router(workshop_map.router)

# Р РµРіРёСЃС‚СЂР°С†РёСЏ РЅРѕРІС‹С… СЂРѕСѓС‚РµСЂРѕРІ
if tasks:
    app.include_router(tasks.router)
if permits:
    app.include_router(permits.router)
if analytics:
    app.include_router(analytics.router)
if notifications:
    app.include_router(notifications.router)
if reports:
    app.include_router(reports.router)
if alerts:
    app.include_router(alerts.router)
if workflow:
    app.include_router(workflow.router)
if telegram:
    app.include_router(telegram.router)
if defect_nodes:
    app.include_router(defect_nodes.router)
if passports:
    app.include_router(passports.router)

# Р РµРіРёСЃС‚СЂР°С†РёСЏ AI СЂРѕСѓС‚РµСЂР° (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ)
try:
    if ai and hasattr(ai, 'router'):
        app.include_router(ai.router)
except (NameError, AttributeError):
    # AI СЂРѕСѓС‚РµСЂ РЅРµ Р·Р°РіСЂСѓР¶РµРЅ, СЌС‚Рѕ РЅРѕСЂРјР°Р»СЊРЅРѕ
    pass

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}

@app.get("/api")
async def api_root():
    return {
        "message": "API Root",
        "endpoints": {
            "health": "/api/health",
            "auth": "/api/auth",
            "users": "/api/users",
            "equipment": "/api/equipment",
            "documents": "/api/documents",
            "knowledge": "/api/knowledge",
            "inspections": "/api/inspections",
            "violations": "/api/violations",
            "acts": "/api/acts",
            "checklists": "/api/checklists",
            "settings": "/api/settings",
            "audit": "/api/audit",
            "files": "/api/files",
            "tasks": "/api/tasks",
            "permits": "/api/permits",
            "analytics": "/api/analytics",
            "notifications": "/api/notifications",
            "alerts": "/api/alerts",
            "reports": "/api/reports",
            "ai": "/api/ai",
            "workflow": "/api/workflow",
            "telegram": "/api/telegram",
            "defect_nodes": "/api/defect-nodes",
            "passports": "/api/passports"
        }
    }

# РџСЂРѕРєСЃРёСЂРѕРІР°РЅРёРµ РІСЃРµС… РЅРµ-API Р·Р°РїСЂРѕСЃРѕРІ РЅР° Frontend
# Р’ production РѕС‚РєР»СЋС‡РµРЅРѕ - Frontend РґРѕР»Р¶РµРЅ РѕР±СЃР»СѓР¶РёРІР°С‚СЊ Р·Р°РїСЂРѕСЃС‹ СЃР°Рј С‡РµСЂРµР· РІРµР±-СЃРµСЂРІРµСЂ
# Р’РєР»СЋС‡Р°РµС‚СЃСЏ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ (РјРѕР¶РЅРѕ РІС‹РєР»СЋС‡РёС‚СЊ РїРµСЂРµРјРµРЅРЅРѕР№ ENABLE_FRONTEND_PROXY=false)
ENABLE_FRONTEND_PROXY = os.getenv("ENABLE_FRONTEND_PROXY", "true").lower() == "true"

if ENABLE_FRONTEND_PROXY:
    @app.get("/{path:path}")
    @app.post("/{path:path}")
    @app.put("/{path:path}")
    @app.delete("/{path:path}")
    @app.patch("/{path:path}")
    async def proxy_to_frontend(request: Request, path: str):
        """РџСЂРѕРєСЃРёСЂРѕРІР°РЅРёРµ РІСЃРµС… РЅРµ-API Р·Р°РїСЂРѕСЃРѕРІ РЅР° Frontend (С‚РѕР»СЊРєРѕ РµСЃР»Рё РІРєР»СЋС‡РµРЅРѕ)"""
        # Р•СЃР»Рё СЌС‚Рѕ API Р·Р°РїСЂРѕСЃ, РІРѕР·РІСЂР°С‰Р°РµРј 404 (РґРѕР»Р¶РµРЅ РѕР±СЂР°Р±Р°С‚С‹РІР°С‚СЊСЃСЏ СЂРѕСѓС‚РµСЂР°РјРё РІС‹С€Рµ)
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        
        # РџСЂРѕРєСЃРёСЂСѓРµРј РЅР° Frontend (РїРѕСЂС‚ 3000)
        frontend_port = os.getenv("FRONTEND_PORT", "3000")
        frontend_url = f"http://localhost:{frontend_port}/{path}"
        
        # Р”РѕР±Р°РІР»СЏРµРј query РїР°СЂР°РјРµС‚СЂС‹
        if request.query_params:
            frontend_url += f"?{str(request.query_params)}"
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # РџРѕР»СѓС‡Р°РµРј С‚РµР»Рѕ Р·Р°РїСЂРѕСЃР°
                body = await request.body()
                
                # РџРѕРґРіРѕС‚Р°РІР»РёРІР°РµРј Р·Р°РіРѕР»РѕРІРєРё (СѓР±РёСЂР°РµРј РїСЂРѕР±Р»РµРјРЅС‹Рµ)
                headers = {}
                for k, v in request.headers.items():
                    k_lower = k.lower()
                    # РЈР±РёСЂР°РµРј Р·Р°РіРѕР»РѕРІРєРё, РєРѕС‚РѕСЂС‹Рµ РјРѕРіСѓС‚ РІС‹Р·РІР°С‚СЊ РїСЂРѕР±Р»РµРјС‹
                    if k_lower not in ["host", "content-length", "accept-encoding", "connection", "transfer-encoding"]:
                        headers[k] = v
                
                # Р”РµР»Р°РµРј Р·Р°РїСЂРѕСЃ Рє Frontend
                response = await client.request(
                    method=request.method,
                    url=frontend_url,
                    headers=headers,
                    content=body if body else None,
                    follow_redirects=False,
                    timeout=5.0
                )
                
                # РџРѕРґРіРѕС‚Р°РІР»РёРІР°РµРј Р·Р°РіРѕР»РѕРІРєРё РѕС‚РІРµС‚Р°
                response_headers = {}
                for k, v in response.headers.items():
                    k_lower = k.lower()
                    # РЈР±РёСЂР°РµРј Р·Р°РіРѕР»РѕРІРєРё СЃР¶Р°С‚РёСЏ
                    if k_lower not in ["content-encoding", "transfer-encoding", "connection"]:
                        response_headers[k] = v
                
                # Р’РѕР·РІСЂР°С‰Р°РµРј РѕС‚РІРµС‚ РѕС‚ Frontend
                return StreamingResponse(
                    iter([response.content]),
                    status_code=response.status_code,
                    headers=response_headers,
                    media_type=response.headers.get("content-type", "text/html")
                )
        except (httpx.RequestError, httpx.TimeoutException) as e:
            # Р’ production РїСЂРѕСЃС‚Рѕ РІРѕР·РІСЂР°С‰Р°РµРј 404, Frontend РґРѕР»Р¶РµРЅ РѕР±СЃР»СѓР¶РёРІР°С‚СЊ Р·Р°РїСЂРѕСЃС‹ СЃР°Рј
            logging.getLogger(__name__).debug(f"Frontend proxy unavailable: {e}")
            raise HTTPException(status_code=404, detail="Not Found")
else:
    # Р’ production РїСЂРѕСЃС‚Рѕ РІРѕР·РІСЂР°С‰Р°РµРј 404 РґР»СЏ РІСЃРµС… РЅРµ-API Р·Р°РїСЂРѕСЃРѕРІ
    @app.get("/{path:path}")
    @app.post("/{path:path}")
    @app.put("/{path:path}")
    @app.delete("/{path:path}")
    @app.patch("/{path:path}")
    async def catch_all(request: Request, path: str):
        """РћР±СЂР°Р±РѕС‚РєР° РІСЃРµС… РЅРµ-API Р·Р°РїСЂРѕСЃРѕРІ - РІ production Frontend РѕР±СЃР»СѓР¶РёРІР°РµС‚ РёС… СЃР°Рј"""
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        # Р’ production Frontend РґРѕР»Р¶РµРЅ РѕР±СЃР»СѓР¶РёРІР°С‚СЊ СЌС‚Рё Р·Р°РїСЂРѕСЃС‹ С‡РµСЂРµР· РІРµР±-СЃРµСЂРІРµСЂ (Nginx)
        raise HTTPException(status_code=404, detail="Not Found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

