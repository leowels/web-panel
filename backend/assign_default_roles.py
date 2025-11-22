"""
Скрипт для назначения роли "inspector" всем пользователям без ролей
Запуск: python assign_default_roles.py
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
    from backend.models import User, Role, UserRole
except ImportError:
    from database import DATABASE_URL
    from models import User, Role, UserRole

async def assign_default_roles():
    # Используем DATABASE_URL из database.py или переменную окружения
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./rostekhnadzor.db")
    engine = create_async_engine(db_url, echo=True)
    
    async with AsyncSession(engine) as session:
        # Получаем роль inspector
        result = await session.execute(select(Role).where(Role.name == "inspector"))
        inspector_role = result.scalar_one_or_none()
        
        if not inspector_role:
            print("Роль 'inspector' не найдена. Создайте её через админ-панель или перезапустите сервер.")
            return
        
        # Получаем всех пользователей
        result = await session.execute(select(User))
        users = result.scalars().all()
        
        assigned_count = 0
        for user in users:
            # Проверяем, есть ли у пользователя роли
            result = await session.execute(
                select(UserRole).where(UserRole.user_id == user.id)
            )
            user_roles = result.scalars().all()
            
            if not user_roles:
                # Назначаем роль inspector
                user_role = UserRole(
                    user_id=user.id,
                    role_id=inspector_role.id,
                    assigned_by=None  # Системное назначение
                )
                session.add(user_role)
                assigned_count += 1
                print(f"Назначена роль 'inspector' пользователю {user.username}")
        
        if assigned_count > 0:
            await session.commit()
            print(f"\nНазначено ролей: {assigned_count}")
        else:
            print("\nВсе пользователи уже имеют роли.")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(assign_default_roles())

