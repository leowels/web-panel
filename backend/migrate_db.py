"""
Ручной скрипт миграции PostgreSQL (psycopg2).
"""
import os
from textwrap import dedent

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT


HOST = os.getenv("PG_HOST", "176.124.216.52")
DATABASE = os.getenv("PG_DATABASE", "default_db")
USER = os.getenv("PG_USER", "gen_user")
PASSWORD = os.getenv("PG_PASSWORD", os.getenv("PG_PASS", ""))
PORT = int(os.getenv("PG_PORT", "5432"))


MIGRATIONS = [
    {
        "name": "users telegram field",
        "statements": [
            """
            ALTER TABLE IF EXISTS users
            ADD COLUMN IF NOT EXISTS telegram_user_id VARCHAR UNIQUE
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id
            ON users(telegram_user_id)
            """,
        ],
    },
    {
        "name": "refresh tokens table",
        "statements": [
            """
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id SERIAL PRIMARY KEY,
                token VARCHAR UNIQUE NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMP NOT NULL,
                is_revoked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        ],
    },
    {
        "name": "tasks table",
        "statements": [
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                title VARCHAR NOT NULL,
                description TEXT,
                equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
                violation_id INTEGER REFERENCES violations(id) ON DELETE SET NULL,
                assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_by INTEGER REFERENCES users(id) NOT NULL,
                status VARCHAR DEFAULT 'open',
                priority VARCHAR DEFAULT 'medium',
                due_date TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                estimated_hours FLOAT,
                actual_hours FLOAT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        ],
    },
    {
        "name": "permits table",
        "statements": [
            """
            CREATE TABLE IF NOT EXISTS permits (
                id SERIAL PRIMARY KEY,
                permit_number VARCHAR UNIQUE NOT NULL,
                equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
                work_type VARCHAR NOT NULL,
                description TEXT NOT NULL,
                responsible_person VARCHAR NOT NULL,
                responsible_organization VARCHAR,
                safety_measures TEXT,
                status VARCHAR DEFAULT 'pending',
                requested_by INTEGER REFERENCES users(id) NOT NULL,
                approved_by INTEGER REFERENCES users(id),
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                actual_start TIMESTAMP,
                actual_end TIMESTAMP,
                approval_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        ],
    },
    {
        "name": "notifications table",
        "statements": [
            """
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR NOT NULL,
                message TEXT NOT NULL,
                notification_type VARCHAR NOT NULL,
                entity_type VARCHAR,
                entity_id INTEGER,
                is_read BOOLEAN DEFAULT FALSE,
                priority VARCHAR DEFAULT 'normal',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                read_at TIMESTAMP
            )
            """
        ],
    },
    {
        "name": "analytics cache table",
        "statements": [
            """
            CREATE TABLE IF NOT EXISTS analytics_cache (
                id SERIAL PRIMARY KEY,
                cache_key VARCHAR UNIQUE NOT NULL,
                data JSONB,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        ],
    },
    {
        "name": "reports table",
        "statements": [
            """
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                report_type VARCHAR NOT NULL,
                title VARCHAR NOT NULL,
                parameters JSONB,
                file_path VARCHAR,
                file_format VARCHAR NOT NULL,
                status VARCHAR DEFAULT 'generating',
                generated_by INTEGER REFERENCES users(id) NOT NULL,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
            """
        ],
    },
    {
        "name": "violations extra fields",
        "statements": [
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS source VARCHAR
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS reported_by INTEGER REFERENCES users(id)
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS attachment_meta JSONB
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS ai_classification JSONB
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS ai_recommendations JSONB
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS violation_type VARCHAR
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS violation_type_description TEXT
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS criticality_level VARCHAR
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS norm_reference VARCHAR
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS recommended_act_text TEXT
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS requirements JSONB
            """,
            """
            ALTER TABLE IF EXISTS violations
            ADD COLUMN IF NOT EXISTS ai_payload_raw JSONB
            """,
        ],
    },
    {
        "name": "files extra fk",
        "statements": [
            """
            ALTER TABLE IF EXISTS files
            ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE
            """,
            """
            ALTER TABLE IF EXISTS files
            ADD COLUMN IF NOT EXISTS permit_id INTEGER REFERENCES permits(id) ON DELETE CASCADE
            """,
        ],
    },
    {
        "name": "indexes",
        "statements": [
            "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
            "CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)",
            "CREATE INDEX IF NOT EXISTS idx_tasks_equipment ON tasks(equipment_id)",
            "CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status)",
            "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)",
            "CREATE INDEX IF NOT EXISTS idx_analytics_expires ON analytics_cache(expires_at)",
            "CREATE INDEX IF NOT EXISTS idx_violations_violation_type ON violations(violation_type)",
            "CREATE INDEX IF NOT EXISTS idx_violations_criticality ON violations(criticality_level)",
            "CREATE INDEX IF NOT EXISTS idx_violations_source ON violations(source)",
        ],
    },
]


def run_migrations():
    password = PASSWORD or input("Введите пароль для PostgreSQL пользователя gen_user: ").strip()
    conn = psycopg2.connect(
        host=HOST,
        port=PORT,
        dbname=DATABASE,
        user=USER,
        password=password,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)

    with conn:
        with conn.cursor() as cur:
            total = len(MIGRATIONS)
            for idx, migration in enumerate(MIGRATIONS, 1):
                print(f"\nВыполняем миграцию {idx}/{total}: {migration['name']} ...")
                try:
                    for statement in migration["statements"]:
                        sql = dedent(statement).strip().rstrip(";")
                        if not sql:
                            continue
                        cur.execute(sql + ";")
                    print("✅ Готово")
                except Exception as exc:
                    conn.rollback()
                    print(f"❌ Ошибка: {exc}")

    conn.close()
    print("\n🎉 Миграция PostgreSQL завершена")


if __name__ == "__main__":
    run_migrations()

