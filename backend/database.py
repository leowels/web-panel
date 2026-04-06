from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import inspect, text
import logging
import os

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

# Настройка SSL для PostgreSQL (если требуется)
connect_args = {}
if DATABASE_URL.startswith("postgresql+asyncpg://") or DATABASE_URL.startswith("postgresql://"):
    # Для asyncpg SSL настраивается через connect_args
    # Проверяем, требуется ли SSL (по умолчанию для внешних БД - да)
    ssl_required = os.getenv("POSTGRESQL_SSL", "true").lower() == "true"
    connect_timeout = float(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "8"))
    command_timeout = float(os.getenv("DB_COMMAND_TIMEOUT_SECONDS", "20"))
    if ssl_required:
        import ssl
        # Создаем SSL контекст без проверки сертификата (для self-signed сертификатов)
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        connect_args = {
            "ssl": ssl_context,
            "timeout": connect_timeout,
            "command_timeout": command_timeout,
            "server_settings": {"client_encoding": "UTF8"},
        }
    else:
        connect_args = {
            "ssl": False,
            "timeout": connect_timeout,
            "command_timeout": command_timeout,
            "server_settings": {"client_encoding": "UTF8"},
        }

engine_kwargs = {
    "echo": False,
    "connect_args": connect_args,
    "pool_pre_ping": True,
    "pool_recycle": int(os.getenv("DB_POOL_RECYCLE_SECONDS", "1800")),
}

if DATABASE_URL.startswith("postgresql+asyncpg://") or DATABASE_URL.startswith("postgresql://"):
    engine_kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "10"))
    engine_kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "20"))
    engine_kwargs["pool_timeout"] = int(os.getenv("DB_POOL_TIMEOUT_SECONDS", "8"))

engine = create_async_engine(DATABASE_URL, **engine_kwargs)
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
    table_names = set(inspector.get_table_names())
    if "equipment" not in table_names and "knowledge_base" not in table_names:
        return

    alter_statements = []

    if "equipment" in table_names:
        existing_columns = {col["name"] for col in inspector.get_columns("equipment")}

        if "inventory_number" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN inventory_number VARCHAR(255)"
            )
        if "registration_number" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN registration_number VARCHAR(255)"
            )
        if "factory_number" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN factory_number VARCHAR(255)"
            )
        if "position" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN position VARCHAR(255)"
            )
        if "workshop" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN workshop VARCHAR(255)"
            )
        if "rostekhnadzor_registered" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN rostekhnadzor_registered BOOLEAN DEFAULT FALSE"
            )
        if "expertise_date" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN expertise_date TIMESTAMP"
            )
        if "operation_permit_until" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN operation_permit_until TIMESTAMP"
            )
        if "operation_banned" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN operation_banned BOOLEAN DEFAULT FALSE"
            )
        if "epb_positive_details" not in existing_columns:
            alter_statements.append(
                "ALTER TABLE equipment ADD COLUMN epb_positive_details TEXT"
            )

    if "knowledge_base" in table_names:
        knowledge_columns = {col["name"] for col in inspector.get_columns("knowledge_base")}
        if "embedding" not in knowledge_columns:
            alter_statements.append(
                "ALTER TABLE knowledge_base ADD COLUMN embedding JSON"
            )
        if "embedding_model" not in knowledge_columns:
            alter_statements.append(
                "ALTER TABLE knowledge_base ADD COLUMN embedding_model VARCHAR(255)"
            )
        if "embedding_updated_at" not in knowledge_columns:
            alter_statements.append(
                "ALTER TABLE knowledge_base ADD COLUMN embedding_updated_at TIMESTAMP"
            )

    if "files" in table_names:
        file_columns = {col["name"] for col in inspector.get_columns("files")}
        if "description" not in file_columns:
            alter_statements.append(
                "ALTER TABLE files ADD COLUMN description TEXT"
            )

    if "users" in table_names:
        user_columns = {col["name"] for col in inspector.get_columns("users")}
        if "telegram_user_id" not in user_columns:
            alter_statements.append(
                "ALTER TABLE users ADD COLUMN telegram_user_id VARCHAR(64)"
            )

    
    if "violations" in table_names:
        violation_columns = {col["name"] for col in inspector.get_columns("violations")}
        if "deadline_source" not in violation_columns:
            alter_statements.append(
                "ALTER TABLE violations ADD COLUMN deadline_source VARCHAR(50)"
            )
        if "deadline_rule_id" not in violation_columns:
            alter_statements.append(
                "ALTER TABLE violations ADD COLUMN deadline_rule_id INTEGER"
            )
        if "is_overdue" not in violation_columns:
            alter_statements.append(
                "ALTER TABLE violations ADD COLUMN is_overdue BOOLEAN DEFAULT FALSE"
            )
        if "overdue_at" not in violation_columns:
            alter_statements.append(
                "ALTER TABLE violations ADD COLUMN overdue_at TIMESTAMP"
            )
        if "defect_node_id" not in violation_columns:
            try:
                if sync_conn.dialect.name == "postgresql":
                    sync_conn.execute(text("ALTER TABLE violations ADD COLUMN IF NOT EXISTS defect_node_id INTEGER"))
                    logger.info("Applied migration: ensure column violations.defect_node_id")
                else:
                    alter_statements.append(
                        "ALTER TABLE violations ADD COLUMN defect_node_id INTEGER"
                    )
            except Exception as exc:
                logger.error(f"Critical migration failed: cannot add violations.defect_node_id: {exc}")
                raise

    if "defect_nodes" not in table_names:
        try:
            id_sql = "SERIAL PRIMARY KEY" if sync_conn.dialect.name != "sqlite" else "INTEGER PRIMARY KEY AUTOINCREMENT"
            sync_conn.execute(text(
                f"""
                CREATE TABLE IF NOT EXISTS defect_nodes (
                    id {id_sql},
                    key VARCHAR(255) NOT NULL UNIQUE,
                    title VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    recommendation TEXT,
                    severity VARCHAR(32) DEFAULT 'medium',
                    position VARCHAR(255) NOT NULL,
                    normal VARCHAR(255),
                    hotspot_size FLOAT,
                    sort_order INTEGER DEFAULT 100,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    updated_by INTEGER,
                    FOREIGN KEY(created_by) REFERENCES users(id),
                    FOREIGN KEY(updated_by) REFERENCES users(id)
                )
                """
            ))
            logger.info("? Applied migration: create table defect_nodes")
        except Exception as exc:
            logger.error(f"Critical migration failed: cannot create table defect_nodes: {exc}")
            raise

    if "violation_sla_rules" not in table_names:
        try:
            id_sql = "SERIAL PRIMARY KEY" if sync_conn.dialect.name != "sqlite" else "INTEGER PRIMARY KEY AUTOINCREMENT"
            sync_conn.execute(text(
                f"""
                CREATE TABLE IF NOT EXISTS violation_sla_rules (
                    id {id_sql},
                    name VARCHAR(255) NOT NULL,
                    violation_type VARCHAR(255),
                    severity VARCHAR(32),
                    days INTEGER NOT NULL,
                    priority INTEGER DEFAULT 100,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            ))
            logger.info("? Applied migration: create table violation_sla_rules")
        except Exception as exc:
            logger.warning(f"? Failed to create table violation_sla_rules: {exc}")

    if "audit_logs" not in table_names:
        try:
            sync_conn.execute(text(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id VARCHAR(36) PRIMARY KEY,
                    entity_type VARCHAR(64) NOT NULL,
                    entity_id VARCHAR(64) NOT NULL,
                    action VARCHAR(32) NOT NULL,
                    field_changes JSON,
                    performed_by INTEGER,
                    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    source VARCHAR(32) DEFAULT 'ui',
                    trace_id VARCHAR(36),
                    FOREIGN KEY(performed_by) REFERENCES users(id)
                )
                """
            ))
            logger.info("? Applied migration: create table audit_logs")
        except Exception as exc:
            logger.warning(f"? Failed to create table audit_logs: {exc}")

    if "alerts" not in table_names:
        try:
            id_sql = "SERIAL PRIMARY KEY" if sync_conn.dialect.name != "sqlite" else "INTEGER PRIMARY KEY AUTOINCREMENT"
            sync_conn.execute(text(
                f"""
                CREATE TABLE IF NOT EXISTS alerts (
                    id {id_sql},
                    entity_type VARCHAR(50) NOT NULL,
                    entity_id INTEGER NOT NULL,
                    type VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    acknowledged_at TIMESTAMP
                )
                """
            ))
            logger.info("? Applied migration: create table alerts")
        except Exception as exc:
            logger.warning(f"? Failed to create table alerts: {exc}")

    if "telegram_ingest_events" not in table_names:
        try:
            id_sql = "SERIAL PRIMARY KEY" if sync_conn.dialect.name != "sqlite" else "INTEGER PRIMARY KEY AUTOINCREMENT"
            sync_conn.execute(text(
                f"""
                CREATE TABLE IF NOT EXISTS telegram_ingest_events (
                    id {id_sql},
                    event_key VARCHAR(255) NOT NULL UNIQUE,
                    violation_id INTEGER NOT NULL,
                    telegram_chat_id VARCHAR(64),
                    telegram_message_id VARCHAR(64),
                    telegram_user_id VARCHAR(64),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(violation_id) REFERENCES violations(id) ON DELETE CASCADE
                )
                """
            ))
            logger.info("? Applied migration: create table telegram_ingest_events")
        except Exception as exc:
            logger.warning(f"? Failed to create table telegram_ingest_events: {exc}")

    if "error_events" in table_names:
        error_event_columns = {col["name"] for col in inspector.get_columns("error_events")}
        if "code" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN code VARCHAR(64)")
        if "message" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN message TEXT")
        if "trace_id" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN trace_id VARCHAR(36)")
        if "path" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN path VARCHAR(255)")
        if "method" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN method VARCHAR(16)")
        if "status_code" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN status_code INTEGER")
        if "retryable" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN retryable BOOLEAN DEFAULT FALSE")
        if "details" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN details JSON")
        if "created_at" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN created_at TIMESTAMP")
        if "resolved_at" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN resolved_at TIMESTAMP")
        if "resolved_by" not in error_event_columns:
            alter_statements.append("ALTER TABLE error_events ADD COLUMN resolved_by INTEGER")

    if "error_events" not in table_names:
        try:
            id_sql = "SERIAL PRIMARY KEY" if sync_conn.dialect.name != "sqlite" else "INTEGER PRIMARY KEY AUTOINCREMENT"
            sync_conn.execute(text(
                f"""
                CREATE TABLE IF NOT EXISTS error_events (
                    id {id_sql},
                    code VARCHAR(64) NOT NULL,
                    message TEXT NOT NULL,
                    trace_id VARCHAR(36) NOT NULL,
                    path VARCHAR(255),
                    method VARCHAR(16),
                    status_code INTEGER NOT NULL,
                    retryable BOOLEAN DEFAULT FALSE,
                    details JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TIMESTAMP,
                    resolved_by INTEGER,
                    FOREIGN KEY(resolved_by) REFERENCES users(id)
                )
                """
            ))
            logger.info("? Applied migration: create table error_events")
        except Exception as exc:
            logger.warning(f"? Failed to create table error_events: {exc}")

    try:
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_entity ON audit_logs(entity_type, entity_id)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_performed_at ON audit_logs(performed_at)"
        ))
    except Exception as exc:
        logger.warning(f"? Failed to create audit_logs indexes: {exc}")

    try:
        sync_conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_entity_type ON alerts(entity_type, entity_id, type)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_alerts_created_at ON alerts(created_at)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_alerts_acknowledged_at ON alerts(acknowledged_at)"
        ))
    except Exception as exc:
        logger.warning(f"? Failed to create alerts indexes: {exc}")

    try:
        sync_conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_telegram_ingest_events_event_key ON telegram_ingest_events(event_key)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_telegram_ingest_events_violation_id ON telegram_ingest_events(violation_id)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_telegram_ingest_events_created_at ON telegram_ingest_events(created_at)"
        ))
    except Exception as exc:
        logger.warning(f"? Failed to create telegram_ingest_events indexes: {exc}")

    try:
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_error_events_created_at ON error_events(created_at)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_error_events_code ON error_events(code)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_error_events_trace_id ON error_events(trace_id)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_error_events_status_code ON error_events(status_code)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_error_events_method ON error_events(method)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_error_events_path ON error_events(path)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_error_events_resolved_at ON error_events(resolved_at)"
        ))
    except Exception as exc:
        logger.warning(f"? Failed to create error_events indexes: {exc}")

    try:
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_defect_nodes_sort_order ON defect_nodes(sort_order)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_defect_nodes_is_active ON defect_nodes(is_active)"
        ))
        sync_conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_violations_defect_node_id ON violations(defect_node_id)"
        ))
    except Exception as exc:
        logger.warning(f"? Failed to create defect nodes indexes: {exc}")

    for stmt in alter_statements:
        try:
            sync_conn.execute(text(stmt))
            logger.info(f"Applied migration: {stmt}")
        except Exception as exc:
            logger.warning(f"Failed to apply migration '{stmt}': {exc}")

    # Critical schema checks for columns that are already referenced by ORM mappings.
    refreshed_inspector = inspect(sync_conn)
    refreshed_tables = set(refreshed_inspector.get_table_names())
    if "violations" in refreshed_tables:
        refreshed_violation_columns = {col["name"] for col in refreshed_inspector.get_columns("violations")}
        if "defect_node_id" not in refreshed_violation_columns:
            raise RuntimeError("Critical schema mismatch: column violations.defect_node_id is missing")
    if "defect_nodes" not in refreshed_tables:
        raise RuntimeError("Critical schema mismatch: table defect_nodes is missing")

    if "users" in table_names:
        try:
            sync_conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_telegram_user_id ON users(telegram_user_id)"
            ))
        except Exception as exc:
            logger.warning(f"? Failed to create users telegram index: {exc}")

    # Cleanup legacy/broken act links to avoid API serialization failures.
    if "act_violations" in table_names:
        try:
            sync_conn.execute(text("DELETE FROM act_violations WHERE violation_id IS NULL"))
            sync_conn.execute(text("DELETE FROM act_violations WHERE act_id IS NULL"))

            if "violations" in table_names:
                sync_conn.execute(
                    text(
                        "DELETE FROM act_violations "
                        "WHERE violation_id IS NOT NULL "
                        "AND violation_id NOT IN (SELECT id FROM violations)"
                    )
                )

            if "acts" in table_names:
                sync_conn.execute(
                    text(
                        "DELETE FROM act_violations "
                        "WHERE act_id IS NOT NULL "
                        "AND act_id NOT IN (SELECT id FROM acts)"
                    )
                )

            logger.info("Applied cleanup for broken act_violations links")
        except Exception as exc:
            logger.warning(f"Failed to cleanup act_violations links: {exc}")
