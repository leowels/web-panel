"""
Скрипт для обновления прав роли "inspector"
Запуск: python update_role_permissions.py
"""
import asyncio
import sys
import os

# Добавляем путь к модулям
backend_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(backend_dir)
sys.path.insert(0, parent_dir)
sys.path.insert(0, backend_dir)

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy import select

# Поддержка запуска как скрипта и как модуля
try:
    from backend.database import DATABASE_URL
    from backend.models import Role
except ImportError:
    from database import DATABASE_URL
    from models import Role

async def update_role_permissions():
    # Используем DATABASE_URL из database.py или переменную окружения
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./inspectorhub.db")
    engine = create_async_engine(db_url, echo=True)
    
    async with AsyncSession(engine) as session:
        # Получаем роль inspector
        result = await session.execute(select(Role).where(Role.name == "inspector"))
        inspector_role = result.scalar_one_or_none()
        
        if not inspector_role:
            print("Роль 'inspector' не найдена.")
            return
        
        # Обновляем права
        inspector_role.permissions = [
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
            "users:read"  # Добавляем право просмотра пользователей
        ]
        
        session.add(inspector_role)
        await session.commit()
        
        print(f"Права роли 'inspector' обновлены:")
        print(f"  {inspector_role.permissions}")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(update_role_permissions())

