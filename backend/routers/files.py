from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import os
import aiofiles
from PIL import Image
import io

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import File as FileModel, Equipment, Inspection, Violation, Act, UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import File as FileModel, Equipment, Inspection, Violation, Act, UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/files", tags=["files"])

UPLOAD_DIR = "uploads"
THUMBNAIL_DIR = "uploads/thumbnails"

# Создание директорий
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

class FileResponseModel(BaseModel):
    id: int
    filename: str
    original_filename: str
    description: Optional[str]
    file_type: str
    mime_type: str
    file_size: int
    file_path: str
    thumbnail_path: Optional[str]
    equipment_id: Optional[int]
    inspection_id: Optional[int]
    violation_id: Optional[int]
    act_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

async def create_thumbnail(file_path: str, output_path: str, size: tuple = (200, 200)):
    """Создание миниатюры для изображения"""
    try:
        img = Image.open(file_path)
        img.thumbnail(size, Image.Resampling.LANCZOS)
        img.save(output_path, "JPEG", quality=85)
        return True
    except Exception:
        return False

@router.get("", response_model=List[FileResponseModel])
async def get_files(
    equipment_id: Optional[int] = None,
    inspection_id: Optional[int] = None,
    violation_id: Optional[int] = None,
    act_id: Optional[int] = None,
    file_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список файлов"""
    await require_permission(current_user, "files:read", db)
    
    query = select(FileModel)
    
    if equipment_id:
        query = query.where(FileModel.equipment_id == equipment_id)
    if inspection_id:
        query = query.where(FileModel.inspection_id == inspection_id)
    if violation_id:
        query = query.where(FileModel.violation_id == violation_id)
    if act_id:
        query = query.where(FileModel.act_id == act_id)
    if file_type:
        query = query.where(FileModel.file_type == file_type)
    
    result = await db.execute(query.order_by(FileModel.created_at.desc()))
    files = result.scalars().all()
    
    return [
        FileResponseModel(
            id=f.id,
            filename=f.filename,
            original_filename=f.original_filename,
            description=f.description,
            file_type=f.file_type,
            mime_type=f.mime_type,
            file_size=f.file_size,
            file_path=f.file_path,
            thumbnail_path=f.thumbnail_path,
            equipment_id=f.equipment_id,
            inspection_id=f.inspection_id,
            violation_id=f.violation_id,
            act_id=f.act_id,
            created_at=f.created_at,
        )
        for f in files
    ]

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(),
    description: Optional[str] = Form(None),
    equipment_id: Optional[int] = None,
    inspection_id: Optional[int] = None,
    violation_id: Optional[int] = None,
    act_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Загрузить файл"""
    await require_permission(current_user, "files:create", db)
    
    # Определение типа файла
    mime_type = file.content_type or "application/octet-stream"
    if mime_type.startswith("image/"):
        file_type = "photo"
    elif mime_type == "application/pdf":
        file_type = "pdf"
    elif mime_type.startswith("video/"):
        file_type = "video"
    else:
        file_type = "document"
    
    # Сохранение файла
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
        file_size = len(content)
    
    # Создание миниатюры для изображений
    thumbnail_path = None
    if file_type == "photo":
        thumbnail_filename = f"thumb_{filename}"
        thumbnail_path_full = os.path.join(THUMBNAIL_DIR, thumbnail_filename)
        if await create_thumbnail(file_path, thumbnail_path_full):
            thumbnail_path = thumbnail_path_full
    
    # Создание записи в БД
    new_file = FileModel(
        filename=filename,
        original_filename=file.filename,
        description=description,
        file_type=file_type,
        mime_type=mime_type,
        file_size=file_size,
        file_path=file_path,
        thumbnail_path=thumbnail_path,
        equipment_id=equipment_id,
        inspection_id=inspection_id,
        violation_id=violation_id,
        act_id=act_id,
        uploaded_by=current_user.id
    )
    db.add(new_file)
    await db.flush()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="file",
        entity_id=new_file.id,
        description=f"Uploaded file {file.filename}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(new_file)
    
    return FileResponseModel(
        id=new_file.id,
        filename=new_file.filename,
        original_filename=new_file.original_filename,
        description=new_file.description,
        file_type=new_file.file_type,
        mime_type=new_file.mime_type,
        file_size=new_file.file_size,
        file_path=new_file.file_path,
        thumbnail_path=new_file.thumbnail_path,
        equipment_id=new_file.equipment_id,
        inspection_id=new_file.inspection_id,
        violation_id=new_file.violation_id,
        act_id=new_file.act_id,
        created_at=new_file.created_at,
    )

@router.get("/{file_id}")
async def download_file(
    file_id: int,
    thumbnail: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Скачать файл"""
    await require_permission(current_user, "files:read", db)
    
    result = await db.execute(select(FileModel).where(FileModel.id == file_id))
    file_record = result.scalar_one_or_none()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = file_record.thumbnail_path if thumbnail and file_record.thumbnail_path else file_record.file_path
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    from fastapi.responses import FileResponse
    return FileResponse(
        path=file_path,
        filename=file_record.original_filename,
        media_type=file_record.mime_type
    )

@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить файл"""
    await require_permission(current_user, "files:delete", db)
    
    result = await db.execute(select(FileModel).where(FileModel.id == file_id))
    file_record = result.scalar_one_or_none()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Удаление файлов с диска
    if os.path.exists(file_record.file_path):
        os.remove(file_record.file_path)
    if file_record.thumbnail_path and os.path.exists(file_record.thumbnail_path):
        os.remove(file_record.thumbnail_path)
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="file",
        entity_id=file_record.id,
        description=f"Deleted file {file_record.original_filename}"
    )
    db.add(activity)
    
    await db.delete(file_record)
    await db.commit()
    return None
