"""
Скрипт для обновления прав ролей "inspector" и "manager"
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

        # Обновляем права inspector
        inspector_role.permissions = [
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
        ]

        # Получаем роль manager
        result = await session.execute(select(Role).where(Role.name == "manager"))
        manager_role = result.scalar_one_or_none()
        if manager_role:
            manager_role.permissions = [
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
                "analytics:read",
            ]
            session.add(manager_role)

        session.add(inspector_role)
        await session.commit()

        print("Права роли 'inspector' обновлены:")
        print(f"  {inspector_role.permissions}")
        if manager_role:
            print("Права роли 'manager' обновлены:")
            print(f"  {manager_role.permissions}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(update_role_permissions())
