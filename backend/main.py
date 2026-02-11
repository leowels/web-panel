from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
import os
import sys
import logging
import httpx
from datetime import datetime
from pathlib import Path

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
    from backend.database import init_db, engine
    from backend.models import Base, User, Role, UserRole
    from backend.utils import get_password_hash
    from backend.routers import users, auth
except ImportError:
    try:
        # РџСЂРѕР±СѓРµРј РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Рµ РёРјРїРѕСЂС‚С‹ (РґР»СЏ uvicorn РЅР°РїСЂСЏРјСѓСЋ)
        from .database import init_db, engine
        from .models import Base, User, Role, UserRole
        from .utils import get_password_hash
        from .routers import users, auth
    except ImportError:
        # Р•СЃР»Рё РЅРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ, РїСЂРѕР±СѓРµРј Р°Р±СЃРѕР»СЋС‚РЅС‹Рµ (РґР»СЏ РїСЂСЏРјРѕРіРѕ Р·Р°РїСѓСЃРєР°)
        from database import init_db, engine
        from models import Base, User, Role, UserRole
        from utils import get_password_hash
        from routers import users, auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    
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
                    "checklists:read",
                    "knowledge:read"
                ]},
            ]
            
            for role_data in roles_data:
                role = Role(**role_data)
                session.add(role)
            
            await session.commit()
        
        # РЎРѕР·РґР°РЅРёРµ Р°РґРјРёРЅР° РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ
        result = await session.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()
        
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        logger = logging.getLogger(__name__)
        
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
            logger.info("РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ admin СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚")
    
    yield
    
    # Shutdown
    await engine.dispose()

app = FastAPI(
    title="InspectorHub API",
    description="РџСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅР°СЏ СЃРёСЃС‚РµРјР° СѓРїСЂР°РІР»РµРЅРёСЏ РёРЅСЃРїРµРєС†РёСЏРјРё Рё РєРѕРЅС‚СЂРѕР»РµРј",
    version="1.0.0",
    lifespan=lifespan
)

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
        notifications, reports, workshop_map, workflow
    )
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
            notifications, reports, workshop_map, workflow
        )
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
                notifications, reports, workshop_map, workflow
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
            tasks = permits = analytics = notifications = reports = workshop_map = workflow = None
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
if workflow:
    app.include_router(workflow.router)

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
            "reports": "/api/reports",
            "ai": "/api/ai",
            "workflow": "/api/workflow"
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

