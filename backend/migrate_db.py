"""
Скрипт миграции базы данных для добавления новых полей
"""
import asyncio
import os
from sqlalchemy import text
from database import engine

async def migrate_database():
    """Добавляем новые поля в существующую БД"""
    
    migrations = [
        # Добавляем telegram_user_id в таблицу users
        """
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS telegram_user_id VARCHAR UNIQUE;
        """,
        
        # Создаем индекс для telegram_user_id
        """
        CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id 
        ON users(telegram_user_id);
        """,
        
        # Создаем таблицу refresh_tokens
        """
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id SERIAL PRIMARY KEY,
            token VARCHAR UNIQUE NOT NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMP NOT NULL,
            is_revoked BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        
        # Создаем таблицу tasks
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
        );
        """,
        
        # Создаем таблицу permits
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
        );
        """,
        
        # Создаем таблицу notifications
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
        );
        """,
        
        # Создаем таблицу analytics_cache
        """
        CREATE TABLE IF NOT EXISTS analytics_cache (
            id SERIAL PRIMARY KEY,
            cache_key VARCHAR UNIQUE NOT NULL,
            data JSONB,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        
        # Создаем таблицу reports
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
        );
        """,
        
        # Добавляем новые поля в таблицу files
        """
        ALTER TABLE files 
        ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS permit_id INTEGER REFERENCES permits(id) ON DELETE CASCADE;
        """,
        
        # Создаем индексы для производительности
        """
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_equipment ON tasks(equipment_id);
        CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status);
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
        CREATE INDEX IF NOT EXISTS idx_analytics_expires ON analytics_cache(expires_at);
        """
    ]
    
    async with engine.begin() as conn:
        for i, migration in enumerate(migrations, 1):
            try:
                print(f"Выполняем миграцию {i}/{len(migrations)}...")
                await conn.execute(text(migration))
                print(f"✅ Миграция {i} выполнена успешно")
            except Exception as e:
                print(f"❌ Ошибка в миграции {i}: {e}")
                # Продолжаем выполнение остальных миграций
                continue
    
    print("🎉 Миграция базы данных завершена!")

if __name__ == "__main__":
    asyncio.run(migrate_database())
