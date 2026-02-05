from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
import os
import sys
import logging
import httpx
from datetime import datetime

# Настройка логирования с временными метками
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Поддержка запуска как скрипта и как модуля
try:
    # Пробуем абсолютные импорты (для uvicorn через run.py)
    from backend.database import init_db, engine
    from backend.models import Base, User, Role, UserRole
    from backend.utils import get_password_hash
    from backend.routers import users, auth
except ImportError:
    try:
        # Пробуем относительные импорты (для uvicorn напрямую)
        from .database import init_db, engine
        from .models import Base, User, Role, UserRole
        from .utils import get_password_hash
        from .routers import users, auth
    except ImportError:
        # Если не получилось, пробуем абсолютные (для прямого запуска)
        from database import init_db, engine
        from models import Base, User, Role, UserRole
        from utils import get_password_hash
        from routers import users, auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    
    # Создание ролей по умолчанию
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy import select
    
    async with AsyncSession(engine) as session:
        # Проверка существования ролей
        result = await session.execute(select(Role))
        existing_roles = result.scalars().all()
        
        if not existing_roles:
            roles_data = [
                {"name": "admin", "description": "Администратор", "permissions": ["*"]},
                {"name": "manager", "description": "Менеджер", "permissions": [
                    "equipment:*",  # Полный доступ к оборудованию
                    "violations:*",  # Полный доступ к нарушениям
                    "inspections:*",  # Полный доступ к осмотрам
                    "acts:*",  # Полный доступ к актам
                    "checklists:*",  # Полный доступ к чек-листам
                    "knowledge:read",
                    "knowledge:create",
                    "knowledge:update",
                    "files:*",
                    "audit:read",
                    "settings:read",
                    "users:read",  # Может просматривать пользователей
                    "reports:read",
                    "reports:export"
                ]},
                {"name": "inspector", "description": "Инспектор", "permissions": [
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
                {"name": "operator", "description": "Оператор", "permissions": [
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
                {"name": "auditor", "description": "Аудитор", "permissions": [
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
                {"name": "viewer", "description": "Просмотр", "permissions": [
                    "equipment:read", 
                    "inspections:read",
                    "violations:read",
                    "acts:read",
                    "checklists:read",
                    "knowledge:read"
                ]},
            ]
            
            for role_data in roles_data:
                role = Role(**role_data)
                session.add(role)
            
            await session.commit()
        
        # Создание админа по умолчанию
        result = await session.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()
        
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        logger = logging.getLogger(__name__)
        
        if not admin:
            logger.info("Создание пользователя admin...")
            admin = User(
                username="admin",
                email="admin@inspectorhub.ru",
                hashed_password=get_password_hash(admin_password),
                full_name="Администратор",
                is_active=True
            )
            session.add(admin)
            await session.flush()
            
            # Назначение роли админа
            admin_role = await session.execute(select(Role).where(Role.name == "admin"))
            role = admin_role.scalar_one()
            
            user_role = UserRole(user_id=admin.id, role_id=role.id)
            session.add(user_role)
            await session.commit()
            logger.info(f"✓ Пользователь admin создан. Пароль: {'установлен из ADMIN_PASSWORD' if os.getenv('ADMIN_PASSWORD') else 'admin123 (по умолчанию)'}")
        else:
            logger.info("Пользователь admin уже существует")
    
    yield
    
    # Shutdown
    await engine.dispose()

app = FastAPI(
    title="InspectorHub API",
    description="Профессиональная система управления инспекциями и контролем",
    version="1.0.0",
    lifespan=lifespan
)

# CORS - настройка через переменные окружения для production
cors_origins_str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,https://leowels-panel.ru")
cors_origins = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Корневой endpoint (должен быть до регистрации роутеров для health checks)
@app.get("/")
async def root():
    return {
        "message": "InspectorHub API",
        "version": "1.0.0",
        "status": "ok",
        "docs": "/docs",
        "health": "/api/health"
    }

# Подключение роутеров
app.include_router(auth.router)
app.include_router(users.router)

# Импорт остальных роутеров
try:
    # Пробуем абсолютные импорты (для uvicorn через run.py)
    from backend.routers import (
        equipment, checklists, inspections, violations, acts, knowledge, 
        files, settings, audit, documents, tasks, permits, analytics, 
        notifications, reports
    )
    try:
        from backend.routers import ai
    except ImportError:
        ai = None
except ImportError:
    try:
        # Пробуем относительные импорты (для uvicorn напрямую)
        from .routers import (
            equipment, checklists, inspections, violations, acts, knowledge,
            files, settings, audit, documents, tasks, permits, analytics,
            notifications, reports
        )
        try:
            from .routers import ai
        except ImportError:
            ai = None
    except ImportError:
        # Пробуем абсолютные импорты (для прямого запуска)
        try:
            from routers import (
                equipment, checklists, inspections, violations, acts, knowledge,
                files, settings, audit, documents, tasks, permits, analytics,
                notifications, reports
            )
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
            tasks = permits = analytics = notifications = reports = None
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

# Регистрация новых роутеров
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

# Регистрация AI роутера (опционально)
try:
    if ai and hasattr(ai, 'router'):
        app.include_router(ai.router)
except (NameError, AttributeError):
    # AI роутер не загружен, это нормально
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
            "reports": "/api/reports",
            "ai": "/api/ai"
        }
    }


@app.get("/health")
async def health_check_compat():
    """Совместимый health endpoint для платформ, ожидающих /health."""
    return await health_check()

# Проксирование всех не-API запросов на Frontend
# В production отключено - Frontend должен обслуживать запросы сам через веб-сервер
# Включается по умолчанию (можно выключить переменной ENABLE_FRONTEND_PROXY=false)
ENABLE_FRONTEND_PROXY = os.getenv("ENABLE_FRONTEND_PROXY", "true").lower() == "true"

if ENABLE_FRONTEND_PROXY:
    @app.get("/{path:path}")
    @app.post("/{path:path}")
    @app.put("/{path:path}")
    @app.delete("/{path:path}")
    @app.patch("/{path:path}")
    async def proxy_to_frontend(request: Request, path: str):
        """Проксирование всех не-API запросов на Frontend (только если включено)"""
        # Если это API запрос, возвращаем 404 (должен обрабатываться роутерами выше)
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        
        # Проксируем на Frontend (порт 3000)
        frontend_port = os.getenv("FRONTEND_PORT", "3000")
        frontend_url = f"http://localhost:{frontend_port}/{path}"
        
        # Добавляем query параметры
        if request.query_params:
            frontend_url += f"?{str(request.query_params)}"
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Получаем тело запроса
                body = await request.body()
                
                # Подготавливаем заголовки (убираем проблемные)
                headers = {}
                for k, v in request.headers.items():
                    k_lower = k.lower()
                    # Убираем заголовки, которые могут вызвать проблемы
                    if k_lower not in ["host", "content-length", "accept-encoding", "connection", "transfer-encoding"]:
                        headers[k] = v
                
                # Делаем запрос к Frontend
                response = await client.request(
                    method=request.method,
                    url=frontend_url,
                    headers=headers,
                    content=body if body else None,
                    follow_redirects=False,
                    timeout=5.0
                )
                
                # Подготавливаем заголовки ответа
                response_headers = {}
                for k, v in response.headers.items():
                    k_lower = k.lower()
                    # Убираем заголовки сжатия
                    if k_lower not in ["content-encoding", "transfer-encoding", "connection"]:
                        response_headers[k] = v
                
                # Возвращаем ответ от Frontend
                return StreamingResponse(
                    iter([response.content]),
                    status_code=response.status_code,
                    headers=response_headers,
                    media_type=response.headers.get("content-type", "text/html")
                )
        except (httpx.RequestError, httpx.TimeoutException) as e:
            # В production просто возвращаем 404, Frontend должен обслуживать запросы сам
            logging.getLogger(__name__).debug(f"Frontend proxy unavailable: {e}")
            raise HTTPException(status_code=404, detail="Not Found")
else:
    # В production просто возвращаем 404 для всех не-API запросов
    @app.get("/{path:path}")
    @app.post("/{path:path}")
    @app.put("/{path:path}")
    @app.delete("/{path:path}")
    @app.patch("/{path:path}")
    async def catch_all(request: Request, path: str):
        """Обработка всех не-API запросов - в production Frontend обслуживает их сам"""
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        # В production Frontend должен обслуживать эти запросы через веб-сервер (Nginx)
        raise HTTPException(status_code=404, detail="Not Found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
