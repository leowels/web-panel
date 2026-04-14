from datetime import datetime
from typing import List, Optional
from urllib.parse import quote
import io
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image

try:
    from backend.models import File as FileModel, UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import File as FileModel, UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/files", tags=["files"])

UPLOAD_DIR = "uploads"
THUMBNAIL_DIR = "uploads/thumbnails"
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
    storage_backend: Optional[str] = None
    equipment_id: Optional[int]
    inspection_id: Optional[int]
    violation_id: Optional[int]
    act_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


def _to_response(file_record: FileModel) -> FileResponseModel:
    return FileResponseModel(
        id=file_record.id,
        filename=file_record.filename,
        original_filename=file_record.original_filename,
        description=file_record.description,
        file_type=file_record.file_type,
        mime_type=file_record.mime_type,
        file_size=file_record.file_size,
        file_path=file_record.file_path,
        thumbnail_path=file_record.thumbnail_path,
        storage_backend=getattr(file_record, "storage_backend", None),
        equipment_id=file_record.equipment_id,
        inspection_id=file_record.inspection_id,
        violation_id=file_record.violation_id,
        act_id=file_record.act_id,
        created_at=file_record.created_at,
    )


def _detect_file_type(mime_type: str) -> str:
    if mime_type.startswith("image/"):
        return "photo"
    if mime_type == "application/pdf":
        return "pdf"
    if mime_type.startswith("video/"):
        return "video"
    return "document"


def _create_thumbnail_bytes(content: bytes, size: tuple[int, int] = (200, 200)) -> Optional[bytes]:
    try:
        image = Image.open(io.BytesIO(content))
        image.thumbnail(size, Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.convert("RGB").save(output, "JPEG", quality=85)
        return output.getvalue()
    except Exception:
        return None


def _content_disposition(filename: Optional[str], inline: bool = True) -> str:
    disposition = "inline" if inline else "attachment"
    safe_name = filename or "file"
    return f"{disposition}; filename*=UTF-8''{quote(safe_name)}"


@router.get("", response_model=List[FileResponseModel])
async def get_files(
    equipment_id: Optional[int] = None,
    inspection_id: Optional[int] = None,
    violation_id: Optional[int] = None,
    act_id: Optional[int] = None,
    file_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
    return [_to_response(item) for item in result.scalars().all()]


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(),
    description: Optional[str] = Form(None),
    equipment_id: Optional[int] = Query(None),
    inspection_id: Optional[int] = Query(None),
    violation_id: Optional[int] = Query(None),
    act_id: Optional[int] = Query(None),
    task_id: Optional[int] = Query(None),
    permit_id: Optional[int] = Query(None),
    equipment_id_form: Optional[int] = Form(None, alias="equipment_id"),
    inspection_id_form: Optional[int] = Form(None, alias="inspection_id"),
    violation_id_form: Optional[int] = Form(None, alias="violation_id"),
    act_id_form: Optional[int] = Form(None, alias="act_id"),
    task_id_form: Optional[int] = Form(None, alias="task_id"),
    permit_id_form: Optional[int] = Form(None, alias="permit_id"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "files:create", db)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")

    mime_type = file.content_type or "application/octet-stream"
    file_type = _detect_file_type(mime_type)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    original_filename = file.filename or "uploaded_file"
    filename = f"{timestamp}_{original_filename}"
    thumbnail_data = _create_thumbnail_bytes(content) if file_type == "photo" else None

    new_file = FileModel(
        filename=filename,
        original_filename=original_filename,
        description=description,
        file_type=file_type,
        mime_type=mime_type,
        file_size=len(content),
        file_path=f"db://files/{filename}",
        thumbnail_path=f"db://files/{filename}/thumbnail" if thumbnail_data else None,
        storage_backend="database",
        data=content,
        thumbnail_data=thumbnail_data,
        equipment_id=equipment_id or equipment_id_form,
        inspection_id=inspection_id or inspection_id_form,
        violation_id=violation_id or violation_id_form,
        act_id=act_id or act_id_form,
        task_id=task_id or task_id_form,
        permit_id=permit_id or permit_id_form,
        uploaded_by=current_user.id,
    )
    db.add(new_file)
    await db.flush()

    db.add(
        UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="file",
            entity_id=new_file.id,
            description=f"Uploaded file {original_filename}",
        )
    )

    await db.commit()
    await db.refresh(new_file)
    return _to_response(new_file)


@router.get("/{file_id}")
async def download_file(
    file_id: int,
    thumbnail: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "files:read", db)

    result = await db.execute(select(FileModel).where(FileModel.id == file_id))
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    data = file_record.thumbnail_data if thumbnail and file_record.thumbnail_data else file_record.data
    if data is not None:
        filename = f"thumb_{file_record.original_filename}" if thumbnail else file_record.original_filename
        media_type = "image/jpeg" if thumbnail and file_record.thumbnail_data else file_record.mime_type
        return StreamingResponse(
            io.BytesIO(data),
            media_type=media_type,
            headers={"Content-Disposition": _content_disposition(filename, inline=True)},
        )

    file_path = file_record.thumbnail_path if thumbnail and file_record.thumbnail_path else file_record.file_path
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=file_path,
        filename=file_record.original_filename,
        media_type=file_record.mime_type,
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_permission(current_user, "files:delete", db)

    result = await db.execute(select(FileModel).where(FileModel.id == file_id))
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    if file_record.file_path and os.path.exists(file_record.file_path):
        os.remove(file_record.file_path)
    if file_record.thumbnail_path and os.path.exists(file_record.thumbnail_path):
        os.remove(file_record.thumbnail_path)

    db.add(
        UserActivity(
            user_id=current_user.id,
            action_type="delete",
            entity_type="file",
            entity_id=file_record.id,
            description=f"Deleted file {file_record.original_filename}",
        )
    )

    await db.delete(file_record)
    await db.commit()
    return None
