from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import os
import aiofiles
import logging

logger = logging.getLogger(__name__)

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import KnowledgeBase, UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import KnowledgeBase, UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

class KnowledgeBaseCreate(BaseModel):
    document_type: str  # fnp461, gost, manual
    section: Optional[str] = None
    clause_number: Optional[str] = None
    title: str
    content: str
    tags: Optional[List[str]] = None

class KnowledgeBaseUpdate(BaseModel):
    section: Optional[str] = None
    clause_number: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None

class KnowledgeBaseResponse(BaseModel):
    id: int
    document_type: str
    section: Optional[str]
    clause_number: Optional[str]
    title: str
    content: str
    tags: Optional[List[str]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AISearchRequest(BaseModel):
    query: str
    document_type: Optional[str] = None

@router.get("", response_model=List[KnowledgeBaseResponse])
async def get_knowledge_base(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    document_type: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить базу знаний"""
    await require_permission(current_user, "knowledge:read", db)
    
    query = select(KnowledgeBase)
    
    if document_type:
        query = query.where(KnowledgeBase.document_type == document_type)
    
    if search:
        query = query.where(
            or_(
                KnowledgeBase.title.ilike(f"%{search}%"),
                KnowledgeBase.content.ilike(f"%{search}%"),
                KnowledgeBase.clause_number.ilike(f"%{search}%")
            )
        )
    
    query = query.order_by(KnowledgeBase.document_type, KnowledgeBase.clause_number).offset(skip).limit(limit)
    result = await db.execute(query)
    knowledge = result.scalars().all()
    
    return [
        KnowledgeBaseResponse(
            id=k.id,
            document_type=k.document_type,
            section=k.section,
            clause_number=k.clause_number,
            title=k.title,
            content=k.content,
            tags=k.tags,
            created_at=k.created_at,
            updated_at=k.updated_at,
        )
        for k in knowledge
    ]

@router.get("/{knowledge_id}", response_model=KnowledgeBaseResponse)
async def get_knowledge_item(
    knowledge_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить элемент базы знаний по ID"""
    await require_permission(current_user, "knowledge:read", db)
    
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id))
    knowledge = result.scalar_one_or_none()
    
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge base item not found")
    
    return KnowledgeBaseResponse(
        id=knowledge.id,
        document_type=knowledge.document_type,
        section=knowledge.section,
        clause_number=knowledge.clause_number,
        title=knowledge.title,
        content=knowledge.content,
        tags=knowledge.tags,
        created_at=knowledge.created_at,
        updated_at=knowledge.updated_at,
    )

def extract_text_from_pdf(file_path: str) -> str:
    """Извлечение текста из PDF файла"""
    try:
        import pdfplumber
        text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return text.strip()
    except ImportError:
        try:
            import PyPDF2
            text = ""
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
            return text.strip()
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {e}")
            return ""
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {e}")
        return ""

def extract_text_from_docx(file_path: str) -> str:
    """Извлечение текста из DOCX файла"""
    try:
        from docx import Document
        doc = Document(file_path)
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text.strip()
    except Exception as e:
        logger.error(f"Error extracting text from DOCX: {e}")
        return ""

@router.post("/upload", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(),
    document_type: str = Form(...),  # fnp461, gost, manual, other
    section: Optional[str] = Form(None),
    clause_number: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),  # JSON строка или через запятую
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Загрузить документ (PDF/DOCX) в базу знаний с автоматическим извлечением текста"""
    await require_permission(current_user, "knowledge:create", db)
    
    # Проверка типа файла
    mime_type = file.content_type or ""
    if mime_type not in ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]:
        raise HTTPException(
            status_code=400,
            detail="Поддерживаются только PDF и DOCX файлы"
        )
    
    # Сохранение файла временно
    UPLOAD_DIR = "uploads/knowledge"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    # Извлечение текста из файла
    extracted_text = ""
    if mime_type == "application/pdf":
        extracted_text = extract_text_from_pdf(file_path)
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        extracted_text = extract_text_from_docx(file_path)
    
    if not extracted_text:
        # Удаляем файл, если не удалось извлечь текст
        try:
            os.remove(file_path)
        except:
            pass
        raise HTTPException(
            status_code=400,
            detail="Не удалось извлечь текст из файла. Убедитесь, что файл содержит текст (не сканированное изображение)."
        )
    
    # Определение заголовка
    doc_title = title or file.filename.replace('.pdf', '').replace('.docx', '').replace('.doc', '')
    
    # Парсинг тегов
    tags_list = []
    if tags:
        try:
            import json
            tags_list = json.loads(tags)
        except:
            tags_list = [tag.strip() for tag in tags.split(',') if tag.strip()]
    
    # Создание записи в базе знаний
    new_knowledge = KnowledgeBase(
        document_type=document_type,
        section=section,
        clause_number=clause_number,
        title=doc_title,
        content=extracted_text,
        tags=tags_list
    )
    db.add(new_knowledge)
    await db.flush()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="knowledge",
        entity_id=new_knowledge.id,
        description=f"Uploaded document to knowledge base: {doc_title}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(new_knowledge)
    
    # Удаляем временный файл после обработки
    try:
        os.remove(file_path)
    except:
        pass
    
    return KnowledgeBaseResponse(
        id=new_knowledge.id,
        document_type=new_knowledge.document_type,
        section=new_knowledge.section,
        clause_number=new_knowledge.clause_number,
        title=new_knowledge.title,
        content=new_knowledge.content,
        tags=new_knowledge.tags,
        created_at=new_knowledge.created_at,
        updated_at=new_knowledge.updated_at,
    )

@router.post("", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
async def create_knowledge_item(
    knowledge_data: KnowledgeBaseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать элемент базы знаний вручную"""
    await require_permission(current_user, "knowledge:create", db)
    
    new_knowledge = KnowledgeBase(
        document_type=knowledge_data.document_type,
        section=knowledge_data.section,
        clause_number=knowledge_data.clause_number,
        title=knowledge_data.title,
        content=knowledge_data.content,
        tags=knowledge_data.tags or []
    )
    db.add(new_knowledge)
    await db.flush()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="knowledge",
        entity_id=new_knowledge.id,
        description=f"Created knowledge item: {knowledge_data.title}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(new_knowledge)
    
    return KnowledgeBaseResponse(
        id=new_knowledge.id,
        document_type=new_knowledge.document_type,
        section=new_knowledge.section,
        clause_number=new_knowledge.clause_number,
        title=new_knowledge.title,
        content=new_knowledge.content,
        tags=new_knowledge.tags,
        created_at=new_knowledge.created_at,
        updated_at=new_knowledge.updated_at,
    )

@router.post("/ai/search", response_model=List[KnowledgeBaseResponse])
async def ai_search_knowledge(
    request: AISearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Поиск в базе знаний через ИИ"""
    await require_permission(current_user, "knowledge:read", db)
    
    try:
        # Используем универсальный AI клиент
        try:
            from backend.ai_client import get_ai_client_async
        except ImportError:
            from ai_client import get_ai_client_async
        
        ai_client = await get_ai_client_async(db)
        
        # Fallback на обычный поиск, если AI не настроен
        if not ai_client:
            query = select(KnowledgeBase)
            if request.document_type:
                query = query.where(KnowledgeBase.document_type == request.document_type)
            query = query.where(
                or_(
                    KnowledgeBase.title.ilike(f"%{request.query}%"),
                    KnowledgeBase.content.ilike(f"%{request.query}%")
                )
            )
            result = await db.execute(query.limit(10))
            knowledge = result.scalars().all()
            
            return [
                KnowledgeBaseResponse(
                    id=k.id,
                    document_type=k.document_type,
                    section=k.section,
                    clause_number=k.clause_number,
                    title=k.title,
                    content=k.content,
                    tags=k.tags,
                    created_at=k.created_at,
                    updated_at=k.updated_at,
                )
                for k in knowledge
            ]
        
        # Получение релевантных документов
        query = select(KnowledgeBase)
        if request.document_type:
            query = query.where(KnowledgeBase.document_type == request.document_type)
        result = await db.execute(query.limit(50))
        all_knowledge = result.scalars().all()
        
        # Использование ИИ для ранжирования
        context = "\n\n".join([f"{k.title}: {k.content[:200]}" for k in all_knowledge[:20]])
        
        ai_prompt = f"""Найди наиболее релевантные документы из базы знаний инспекции для запроса: "{request.query}"

Документы:
{context}

Верни только номера наиболее релевантных документов (первые 5)."""
        
        system_prompt = "Ты помощник для поиска в базе знаний инспекции."
        
        ai_response = ai_client.generate_text(
            prompt=ai_prompt,
            system_prompt=system_prompt,
            max_tokens=100,
            temperature=0.3
        )
        
        # Парсинг ответа (упрощенный)
        # В реальности нужен более сложный парсинг
        # Пока возвращаем обычный поиск
        search_query = select(KnowledgeBase)
        if request.document_type:
            search_query = search_query.where(KnowledgeBase.document_type == request.document_type)
        search_query = search_query.where(
            or_(
                KnowledgeBase.title.ilike(f"%{request.query}%"),
                KnowledgeBase.content.ilike(f"%{request.query}%")
            )
        )
        result = await db.execute(search_query.limit(10))
        knowledge = result.scalars().all()
        
        return [
            KnowledgeBaseResponse(
                id=k.id,
                document_type=k.document_type,
                section=k.section,
                clause_number=k.clause_number,
                title=k.title,
                content=k.content,
                tags=k.tags,
                created_at=k.created_at,
                updated_at=k.updated_at,
            )
            for k in knowledge
        ]
    except Exception as e:
        # Fallback на обычный поиск
        query = select(KnowledgeBase)
        if request.document_type:
            query = query.where(KnowledgeBase.document_type == request.document_type)
        query = query.where(
            or_(
                KnowledgeBase.title.ilike(f"%{request.query}%"),
                KnowledgeBase.content.ilike(f"%{request.query}%")
            )
        )
        result = await db.execute(query.limit(10))
        knowledge = result.scalars().all()
        
        return [
            KnowledgeBaseResponse(
                id=k.id,
                document_type=k.document_type,
                section=k.section,
                clause_number=k.clause_number,
                title=k.title,
                content=k.content,
                tags=k.tags,
                created_at=k.created_at,
                updated_at=k.updated_at,
            )
            for k in knowledge
        ]

@router.put("/{knowledge_id}", response_model=KnowledgeBaseResponse)
async def update_knowledge_item(
    knowledge_id: int,
    knowledge_data: KnowledgeBaseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить элемент базы знаний"""
    await require_permission(current_user, "knowledge:update", db)
    
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id))
    knowledge = result.scalar_one_or_none()
    
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge base item not found")
    
    update_data = knowledge_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(knowledge, field, value)
    
    knowledge.updated_at = datetime.utcnow()
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="knowledge",
        entity_id=knowledge.id,
        description=f"Updated knowledge base item {knowledge.title}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(knowledge)
    
    return KnowledgeBaseResponse(
        id=knowledge.id,
        document_type=knowledge.document_type,
        section=knowledge.section,
        clause_number=knowledge.clause_number,
        title=knowledge.title,
        content=knowledge.content,
        tags=knowledge.tags,
        created_at=knowledge.created_at,
        updated_at=knowledge.updated_at,
    )

@router.delete("/{knowledge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge_item(
    knowledge_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить элемент базы знаний"""
    await require_permission(current_user, "knowledge:delete", db)
    
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id))
    knowledge = result.scalar_one_or_none()
    
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge base item not found")
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="delete",
        entity_type="knowledge",
        entity_id=knowledge.id,
        description=f"Deleted knowledge base item {knowledge.title}"
    )
    db.add(activity)
    
    await db.delete(knowledge)
    await db.commit()
    return None

