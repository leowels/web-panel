from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
import os

# Поддержка запуска как скрипта и как модуля
try:
    # Пробуем относительные импорты (для uvicorn)
    from .models import Base
except ImportError:
    # Если не получилось, пробуем абсолютные (для прямого запуска)
    from models import Base

# Получаем DATABASE_URL из переменных окружения
_raw_db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./rostekhnadzor.db")

# Конвертируем postgresql:// в postgresql+asyncpg:// для SQLAlchemy async
if _raw_db_url.startswith("postgresql://"):
    DATABASE_URL = _raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif _raw_db_url.startswith("postgresql+asyncpg://"):
    DATABASE_URL = _raw_db_url
else:
    DATABASE_URL = _raw_db_url

# Предупреждение о SQLite в production
if DATABASE_URL.startswith("sqlite") and os.getenv("ENVIRONMENT") == "production":
    import warnings
    warnings.warn(
        "⚠️ WARNING: SQLite is not recommended for production! "
        "Please use PostgreSQL or MySQL. Set DATABASE_URL to a production database.",
        UserWarning
    )

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    """Инициализация базы данных"""
    try:
        async with engine.begin() as conn:
            # Создаем все таблицы (только если их нет)
            # SQLAlchemy автоматически проверяет существование таблиц
            await conn.run_sync(Base.metadata.create_all)
            import logging
            logging.getLogger(__name__).info("✓ Database tables initialized successfully")
    except Exception as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"ERROR: Failed to initialize database: {e}")
        traceback.print_exc()
        raise

