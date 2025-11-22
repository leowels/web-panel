from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

# Поддержка запуска как скрипта и как модуля
try:
    from backend.database import get_db
    from backend.auth import get_current_user
    from backend.models import User
except ImportError:
    from ..database import get_db
    from ..auth import get_current_user
    from ..models import User

router = APIRouter(prefix="/api/documents", tags=["documents"])

class DocumentResponse(BaseModel):
    id: int
    title: str
    content: Optional[str] = None
    category: Optional[str] = None
    status: str
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("", response_model=List[DocumentResponse])
async def get_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список документов (заглушка)"""
    # Временная заглушка - возвращаем пустой список
    # В будущем можно реализовать полноценное управление документами
    return []

@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    title: str,
    content: Optional[str] = None,
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать документ (заглушка)"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Document management is not implemented yet"
    )

@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить документ (заглушка)"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Document management is not implemented yet"
    )

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить документ (заглушка)"""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Document management is not implemented yet"
    )

