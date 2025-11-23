from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import sys
import logging
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
                {"name": "inspector", "description": "Инспектор", "permissions": [
                    "inspections:*", 
                    "equipment:read", 
                    "equipment:create",
                    "equipment:update",
                    "violations:*", 
                    "acts:read",
                    "acts:create",
                    "acts:update",  # Инспектор может обновлять акты
                    "checklists:read",
                    "checklists:create",
                    "knowledge:read",
                    "files:read",
                    "files:create",
                    "audit:read",
                    "settings:read",
                    "users:read"  # Инспектор может просматривать список пользователей
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
        
        if not admin:
            admin = User(
                username="admin",
                email="admin@rostekhnadzor.ru",
                hashed_password=get_password_hash(os.getenv("ADMIN_PASSWORD", "admin123")),
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
    
    yield
    
    # Shutdown
    await engine.dispose()

app = FastAPI(
    title="Ростехнадзор Панель API",
    description="Корпоративная система управления для Ростехнадзора",
    version="1.0.0",
    lifespan=lifespan
)

# CORS - настройка через переменные окружения для production
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
cors_origins = [origin.strip() for origin in cors_origins if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(auth.router)
app.include_router(users.router)

# Импорт остальных роутеров
try:
    # Пробуем абсолютные импорты (для uvicorn через run.py)
    from backend.routers import equipment, checklists, inspections, violations, acts, knowledge, files, settings, audit, documents
    try:
        from backend.routers import ai
    except ImportError:
        ai = None
except ImportError:
    try:
        # Пробуем относительные импорты (для uvicorn напрямую)
        from .routers import equipment, checklists, inspections, violations, acts, knowledge, files, settings, audit, documents
        try:
            from .routers import ai
        except ImportError:
            ai = None
    except ImportError:
        # Пробуем абсолютные импорты (для прямого запуска)
        try:
            from routers import equipment, checklists, inspections, violations, acts, knowledge, files, settings, audit, documents
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
