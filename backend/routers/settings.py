from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.sql.sqltypes import DateTime as SQLADateTime, Integer as SQLAInteger, LargeBinary as SQLALargeBinary
from typing import Any, Dict, Optional
from datetime import datetime
from pydantic import BaseModel
import base64
import json
from pathlib import Path

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import Base, SystemSettings, User, UserActivity
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
    from backend.utils import get_password_hash, verify_password
except ImportError:
    from ..models import Base, SystemSettings, User, UserActivity
    from ..database import get_db
    from ..auth import get_current_user, require_permission
    from ..utils import get_password_hash, verify_password

router = APIRouter(prefix="/api/settings", tags=["settings"])

BACKUP_FORMAT = "inspectorhub.full-backup.v1"

class UserSettingsUpdate(BaseModel):
    full_name: Optional[str] = None
    organization: Optional[str] = None
    signature: Optional[str] = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class SystemSettingUpdate(BaseModel):
    value: str


def _serialize_backup_value(value: Any, column) -> Any:
    if value is None:
        return None
    if isinstance(column.type, SQLALargeBinary):
        return base64.b64encode(value).decode("ascii")
    if isinstance(column.type, SQLADateTime):
        return value.isoformat() if hasattr(value, "isoformat") else str(value)
    return value


def _deserialize_backup_value(value: Any, column) -> Any:
    if value is None:
        return None
    if isinstance(column.type, SQLALargeBinary):
        return base64.b64decode(value.encode("ascii")) if value else None
    if isinstance(column.type, SQLADateTime):
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    return value


def _read_existing_file_bytes(path_value: Any) -> Optional[bytes]:
    if not path_value:
        return None
    path_text = str(path_value)
    if path_text.startswith("db://"):
        return None

    candidates = [
        Path(path_text),
        Path.cwd() / path_text,
        Path(__file__).resolve().parents[1] / path_text,
    ]
    for candidate in candidates:
        try:
            if candidate.is_file():
                return candidate.read_bytes()
        except OSError:
            continue
    return None


def _normalize_legacy_file_row(table_name: str, row: Dict[str, Any]) -> Dict[str, Any]:
    if table_name != "files":
        return row

    if not row.get("data"):
        file_data = _read_existing_file_bytes(row.get("file_path"))
        if file_data:
            row["data"] = file_data
            row["storage_backend"] = "database"
            row["file_path"] = f"db://files/{row.get('filename') or row.get('id')}"

    if not row.get("thumbnail_data"):
        thumbnail_data = _read_existing_file_bytes(row.get("thumbnail_path"))
        if thumbnail_data:
            row["thumbnail_data"] = thumbnail_data
            row["thumbnail_path"] = f"db://files/{row.get('filename') or row.get('id')}/thumbnail"

    return row


def _build_import_rows(table, rows: list[dict]) -> list[dict]:
    columns = {column.name: column for column in table.columns}
    prepared_rows = []
    for row in rows:
        prepared = {}
        for key, value in row.items():
            column = columns.get(key)
            if not column:
                continue
            prepared[key] = _deserialize_backup_value(value, column)
        prepared_rows.append(prepared)
    return prepared_rows


async def _reset_postgres_sequences(db: AsyncSession, tables) -> None:
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return

    preparer = bind.dialect.identifier_preparer
    for table in tables:
        integer_pk_columns = [
            column for column in table.primary_key.columns
            if column.autoincrement is not False and isinstance(column.type, SQLAInteger)
        ]
        if len(integer_pk_columns) != 1:
            continue

        pk = integer_pk_columns[0]
        quoted_table = preparer.quote(table.name)
        quoted_pk = preparer.quote(pk.name)
        await db.execute(
            text(
                "SELECT setval("
                f"pg_get_serial_sequence('{table.name}', '{pk.name}'), "
                f"COALESCE((SELECT MAX({quoted_pk}) FROM {quoted_table}), 1), "
                f"(SELECT COUNT(*) > 0 FROM {quoted_table})"
                ")"
            )
        )

@router.get("/user")
async def get_user_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить настройки пользователя"""
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "organization": user.organization,
        "signature": user.signature,
    }

@router.put("/user")
async def update_user_settings(
    settings: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить настройки пользователя"""
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    
    if settings.full_name is not None:
        user.full_name = settings.full_name
    if settings.organization is not None:
        user.organization = settings.organization
    if settings.signature is not None:
        user.signature = settings.signature
    
    await db.commit()
    await db.refresh(user)
    
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "organization": user.organization,
        "signature": user.signature,
    }

@router.post("/user/change-password")
async def change_user_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Смена пароля пользователя"""
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    
    if not verify_password(password_data.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    
    user.hashed_password = get_password_hash(password_data.new_password)
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="user",
        entity_id=user.id,
        description="Changed password"
    )
    db.add(activity)
    
    await db.commit()
    return {"message": "Password changed successfully"}


@router.get("/backup/export")
async def export_full_project_backup(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Экспорт полного снимка всех таблиц проекта в JSON."""
    await require_permission(current_user, "settings:read", db)

    tables = list(Base.metadata.sorted_tables)
    backup: Dict[str, Any] = {
        "format": BACKUP_FORMAT,
        "exported_at": datetime.utcnow().isoformat(),
        "table_order": [table.name for table in tables],
        "tables": {},
    }

    total_rows = 0
    for table in tables:
        result = await db.execute(select(table))
        rows = []
        for row in result.mappings().all():
            raw_row = _normalize_legacy_file_row(
                table.name,
                {column.name: row.get(column.name) for column in table.columns},
            )
            serialized_row = {
                column.name: _serialize_backup_value(raw_row.get(column.name), column)
                for column in table.columns
            }
            rows.append(serialized_row)
        backup["tables"][table.name] = {
            "columns": [column.name for column in table.columns],
            "rows": rows,
        }
        total_rows += len(rows)

    backup["summary"] = {
        "tables": len(tables),
        "rows": total_rows,
    }

    content = json.dumps(backup, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    filename = f"inspectorhub_full_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/backup/import")
async def import_full_project_backup(
    file: UploadFile = File(...),
    confirm: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Импорт полного снимка проекта с заменой текущих данных."""
    await require_permission(current_user, "settings:update", db)

    if confirm.strip() != "ЗАМЕНИТЬ ВСЕ ДАННЫЕ":
        raise HTTPException(
            status_code=400,
            detail='Для импорта укажите подтверждение: "ЗАМЕНИТЬ ВСЕ ДАННЫЕ"',
        )

    raw_content = await file.read()
    if not raw_content:
        raise HTTPException(status_code=400, detail="Файл импорта пуст")

    try:
        payload = json.loads(raw_content.decode("utf-8-sig"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Не удалось прочитать JSON backup") from exc

    if payload.get("format") != BACKUP_FORMAT:
        raise HTTPException(status_code=400, detail="Неверный формат backup-файла")

    tables_payload = payload.get("tables")
    if not isinstance(tables_payload, dict):
        raise HTTPException(status_code=400, detail="В backup-файле нет блока tables")

    tables = list(Base.metadata.sorted_tables)
    imported_rows = 0

    try:
        for table in reversed(tables):
            await db.execute(table.delete())

        for table in tables:
            table_payload = tables_payload.get(table.name)
            if not table_payload:
                continue
            rows = table_payload.get("rows", [])
            if not rows:
                continue
            prepared_rows = _build_import_rows(table, rows)
            if prepared_rows:
                await db.execute(table.insert(), prepared_rows)
                imported_rows += len(prepared_rows)

        await _reset_postgres_sequences(db, tables)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Не удалось импортировать backup: {exc}",
        ) from exc

    return {
        "message": "Backup успешно импортирован",
        "tables": len(tables),
        "rows": imported_rows,
    }

@router.get("/system")
async def get_system_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить системные настройки"""
    await require_permission(current_user, "settings:read", db)
    
    result = await db.execute(select(SystemSettings))
    settings = result.scalars().all()
    
    return {s.key: s.value for s in settings}

@router.get("/system/{key}")
async def get_system_setting(
    key: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить системную настройку по ключу"""
    await require_permission(current_user, "settings:read", db)
    
    result = await db.execute(select(SystemSettings).where(SystemSettings.key == key))
    setting = result.scalar_one_or_none()
    
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    return {"key": setting.key, "value": setting.value, "description": setting.description}

@router.put("/system/{key}")
async def update_system_setting(
    key: str,
    setting_data: SystemSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить системную настройку"""
    await require_permission(current_user, "settings:update", db)
    
    result = await db.execute(select(SystemSettings).where(SystemSettings.key == key))
    setting = result.scalar_one_or_none()
    
    if not setting:
        # Создание новой настройки
        setting = SystemSettings(
            key=key,
            value=setting_data.value,
            updated_by=current_user.id
        )
        db.add(setting)
    else:
        setting.value = setting_data.value
        setting.updated_by = current_user.id
        setting.updated_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="settings",
        description=f"Updated system setting {key}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(setting)
    
    # Если обновлены AI настройки, очищаем кэш AI клиента
    if key.startswith("ai_"):
        try:
            from backend.ai_client import clear_ai_client_cache
        except ImportError:
            try:
                from ai_client import clear_ai_client_cache
            except ImportError:
                pass
        else:
            clear_ai_client_cache()
    
    return {"key": setting.key, "value": setting.value, "description": setting.description}

