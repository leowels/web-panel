from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import inspect, text
import logging
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Поддержка запуска как скрипта и как модуля
try:
    # Пробуем относительные импорты (для uvicorn)
    from .models import Base
except ImportError:
    # Если не получилось, пробуем абсолютные (для прямого запуска)
    from models import Base

# Получаем DATABASE_URL из переменных окружения
# Поддержка двух вариантов:
# 1. DATABASE_URL (полная строка подключения)
# 2. POSTGRESQL_HOST, POSTGRESQL_PORT, POSTGRESQL_USER, POSTGRESQL_PASSWORD, POSTGRESQL_DBNAME (отдельные параметры)

_raw_db_url = os.getenv("DATABASE_URL")

# Если DATABASE_URL не задан, пробуем собрать из отдельных переменных
if not _raw_db_url:
    pg_host = os.getenv("POSTGRESQL_HOST")
    pg_port = os.getenv("POSTGRESQL_PORT", "5432")
    pg_user = os.getenv("POSTGRESQL_USER")
    pg_password = os.getenv("POSTGRESQL_PASSWORD")
    pg_dbname = os.getenv("POSTGRESQL_DBNAME")
    
    if pg_host and pg_user and pg_password and pg_dbname:
        # URL-кодируем пароль для безопасности
        from urllib.parse import quote_plus
        encoded_password = quote_plus(pg_password)
        # Не добавляем sslmode в URL - asyncpg не поддерживает это
        _raw_db_url = f"postgresql://{pg_user}:{encoded_password}@{pg_host}:{pg_port}/{pg_dbname}"
    else:
        # Fallback на SQLite для разработки
        _raw_db_url = "sqlite+aiosqlite:///./inspectorhub.db"

def _normalize_database_url(raw_url: str) -> tuple[str, str | None]:
    """
    Нормализует DATABASE_URL для SQLAlchemy + asyncpg.

    В managed PostgreSQL часто используется `?sslmode=require`,
    но asyncpg не понимает параметр `sslmode` в query-строке.
    Мы удаляем его из URL и применяем через connect_args.
    """
    if raw_url.startswith("postgresql://"):
        normalized = raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    else:
        normalized = raw_url

    if not normalized.startswith("postgresql+asyncpg://"):
        return normalized, None

    parsed = urlsplit(normalized)
    query_items = parse_qsl(parsed.query, keep_blank_values=True)

    sslmode = None
    filtered_query: list[tuple[str, str]] = []
    for key, value in query_items:
        if key.lower() == "sslmode":
            sslmode = value.lower()
        else:
            filtered_query.append((key, value))

    cleaned_query = urlencode(filtered_query)
    cleaned_url = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, cleaned_query, parsed.fragment))
    return cleaned_url, sslmode


DATABASE_URL, db_sslmode = _normalize_database_url(_raw_db_url)

# Предупреждение о SQLite в production
if DATABASE_URL.startswith("sqlite") and os.getenv("ENVIRONMENT") == "production":
    import warnings
    warnings.warn(
        "⚠️ WARNING: SQLite is not recommended for production! "
        "Please use PostgreSQL or MySQL. Set DATABASE_URL to a production database.",
        UserWarning
    )

# Настройка SSL для PostgreSQL (если требуется)
connect_args = {}
if DATABASE_URL.startswith("postgresql+asyncpg://") or DATABASE_URL.startswith("postgresql://"):
    # Для asyncpg SSL настраивается через connect_args
    # Приоритет:
    # 1) sslmode из DATABASE_URL (если задан)
    # 2) POSTGRESQL_SSL (иначе, по умолчанию false для локальных/обычных инсталляций)
    if db_sslmode in {"require", "verify-ca", "verify-full"}:
        ssl_required = True
    elif db_sslmode in {"disable", "allow", "prefer"}:
        ssl_required = False
    else:
        ssl_required = os.getenv("POSTGRESQL_SSL", "false").lower() == "true"

    if ssl_required:
        import ssl
        # Создаем SSL контекст без проверки сертификата (для self-signed сертификатов)
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        connect_args = {"ssl": ssl_context}

engine = create_async_engine(DATABASE_URL, echo=False, connect_args=connect_args)
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
            await conn.run_sync(_apply_custom_migrations)
            logging.getLogger(__name__).info("✓ Database tables initialized successfully")
    except Exception as e:
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"ERROR: Failed to initialize database: {e}")
        traceback.print_exc()
        raise


def _apply_custom_migrations(sync_conn):
    """
    Простейшие миграции для существующих БД без Alembic.
    Добавляем новые колонки, если их еще нет (для оборудования).
    """
    logger = logging.getLogger(__name__)
    inspector = inspect(sync_conn)
    if "equipment" not in inspector.get_table_names():
        return

    existing_columns = {col["name"] for col in inspector.get_columns("equipment")}
    alter_statements = []

    if "inventory_number" not in existing_columns:
        alter_statements.append(
            "ALTER TABLE equipment ADD COLUMN inventory_number VARCHAR(255)"
        )
    if "position" not in existing_columns:
        alter_statements.append(
            "ALTER TABLE equipment ADD COLUMN position VARCHAR(255)"
        )
    if "workshop" not in existing_columns:
        alter_statements.append(
            "ALTER TABLE equipment ADD COLUMN workshop VARCHAR(255)"
        )

    for stmt in alter_statements:
        try:
            sync_conn.execute(text(stmt))
            logger.info(f"✓ Applied migration: {stmt}")
        except Exception as exc:
            logger.warning(f"⚠️ Failed to apply migration '{stmt}': {exc}")
