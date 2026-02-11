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

# РџРѕРґРґРµСЂР¶РєР° Р·Р°РїСѓСЃРєР° РєР°Рє СЃРєСЂРёРїС‚Р° Рё РєР°Рє РјРѕРґСѓР»СЏ
try:
    from backend.models import KnowledgeBase, UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
    from backend.knowledge_semantic import semantic_search_knowledge, apply_embeddings
except ImportError:
    from ..models import KnowledgeBase, UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission
    from ..knowledge_semantic import semantic_search_knowledge, apply_embeddings

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

class EmbeddingBackfillRequest(BaseModel):
    limit: int = 200

@router.get("", response_model=List[KnowledgeBaseResponse])
async def get_knowledge_base(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    document_type: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """РџРѕР»СѓС‡РёС‚СЊ Р±Р°Р·Сѓ Р·РЅР°РЅРёР№"""
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
    """РџРѕР»СѓС‡РёС‚СЊ СЌР»РµРјРµРЅС‚ Р±Р°Р·С‹ Р·РЅР°РЅРёР№ РїРѕ ID"""
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
    """РР·РІР»РµС‡РµРЅРёРµ С‚РµРєСЃС‚Р° РёР· PDF С„Р°Р№Р»Р°"""
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
    """РР·РІР»РµС‡РµРЅРёРµ С‚РµРєСЃС‚Р° РёР· DOCX С„Р°Р№Р»Р°"""
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
    tags: Optional[str] = Form(None),  # JSON СЃС‚СЂРѕРєР° РёР»Рё С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Р—Р°РіСЂСѓР·РёС‚СЊ РґРѕРєСѓРјРµРЅС‚ (PDF/DOCX) РІ Р±Р°Р·Сѓ Р·РЅР°РЅРёР№ СЃ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРёРј РёР·РІР»РµС‡РµРЅРёРµРј С‚РµРєСЃС‚Р°"""
    await require_permission(current_user, "knowledge:create", db)
    
    # РџСЂРѕРІРµСЂРєР° С‚РёРїР° С„Р°Р№Р»Р°
    mime_type = file.content_type or ""
    if mime_type not in ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]:
        raise HTTPException(
            status_code=400,
            detail="РџРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ С‚РѕР»СЊРєРѕ PDF Рё DOCX С„Р°Р№Р»С‹"
        )
    
    # РЎРѕС…СЂР°РЅРµРЅРёРµ С„Р°Р№Р»Р° РІСЂРµРјРµРЅРЅРѕ
    UPLOAD_DIR = "uploads/knowledge"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    async with aiofiles.open(file_path, 'wb') as f:
        content = await file.read()
        await f.write(content)
    
    # РР·РІР»РµС‡РµРЅРёРµ С‚РµРєСЃС‚Р° РёР· С„Р°Р№Р»Р°
    extracted_text = ""
    if mime_type == "application/pdf":
        extracted_text = extract_text_from_pdf(file_path)
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        extracted_text = extract_text_from_docx(file_path)
    
    if not extracted_text:
        # РЈРґР°Р»СЏРµРј С„Р°Р№Р», РµСЃР»Рё РЅРµ СѓРґР°Р»РѕСЃСЊ РёР·РІР»РµС‡СЊ С‚РµРєСЃС‚
        try:
            os.remove(file_path)
        except:
            pass
        raise HTTPException(
            status_code=400,
            detail="РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РІР»РµС‡СЊ С‚РµРєСЃС‚ РёР· С„Р°Р№Р»Р°. РЈР±РµРґРёС‚РµСЃСЊ, С‡С‚Рѕ С„Р°Р№Р» СЃРѕРґРµСЂР¶РёС‚ С‚РµРєСЃС‚ (РЅРµ СЃРєР°РЅРёСЂРѕРІР°РЅРЅРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ)."
        )
    
    # РћРїСЂРµРґРµР»РµРЅРёРµ Р·Р°РіРѕР»РѕРІРєР°
    doc_title = title or file.filename.replace('.pdf', '').replace('.docx', '').replace('.doc', '')
    
    # РџР°СЂСЃРёРЅРі С‚РµРіРѕРІ
    tags_list = []
    if tags:
        try:
            import json
            tags_list = json.loads(tags)
        except:
            tags_list = [tag.strip() for tag in tags.split(',') if tag.strip()]
    
    # РЎРѕР·РґР°РЅРёРµ Р·Р°РїРёСЃРё РІ Р±Р°Р·Рµ Р·РЅР°РЅРёР№
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
    
    try:
        await apply_embeddings(db, [new_knowledge])
    except Exception as exc:
        logger.warning(f"Embedding generation failed for knowledge upload: {exc}")
    
    # Р›РѕРіРёСЂРѕРІР°РЅРёРµ
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
    
    # РЈРґР°Р»СЏРµРј РІСЂРµРјРµРЅРЅС‹Р№ С„Р°Р№Р» РїРѕСЃР»Рµ РѕР±СЂР°Р±РѕС‚РєРё
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
    """РЎРѕР·РґР°С‚СЊ СЌР»РµРјРµРЅС‚ Р±Р°Р·С‹ Р·РЅР°РЅРёР№ РІСЂСѓС‡РЅСѓСЋ"""
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
    
    try:
        await apply_embeddings(db, [new_knowledge])
    except Exception as exc:
        logger.warning(f"Embedding generation failed for knowledge create: {exc}")
    
    # Р›РѕРіРёСЂРѕРІР°РЅРёРµ
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
        semantic_results = await semantic_search_knowledge(
            db,
            request.query,
            document_type=request.document_type,
            limit=10,
            backfill=True
        )
        if semantic_results:
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
                for k in semantic_results
            ]
    except Exception as exc:
        logger.warning(f"Semantic search failed, fallback to plain search: {exc}")

    # Fallback: обычный поиск
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

@router.post("/embeddings/backfill")
async def backfill_knowledge_embeddings(
    request: EmbeddingBackfillRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Backfill knowledge embeddings"""
    await require_permission(current_user, "knowledge:update", db)
    limit = max(1, min(request.limit, 1000))
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.embedding.is_(None)).limit(limit)
    )
    items = result.scalars().all()
    if not items:
        return {"status": "ok", "processed": 0, "updated": 0}
    updated = await apply_embeddings(db, items)
    await db.commit()
    return {
        "status": "ok",
        "processed": len(items),
        "updated": len(items) if updated else 0
    }
@router.put("/{knowledge_id}", response_model=KnowledgeBaseResponse)
async def update_knowledge_item(
    knowledge_id: int,
    knowledge_data: KnowledgeBaseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """РћР±РЅРѕРІРёС‚СЊ СЌР»РµРјРµРЅС‚ Р±Р°Р·С‹ Р·РЅР°РЅРёР№"""
    await require_permission(current_user, "knowledge:update", db)
    
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id))
    knowledge = result.scalar_one_or_none()
    
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge base item not found")
    
    update_data = knowledge_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(knowledge, field, value)
    
    knowledge.updated_at = datetime.utcnow()
    if any(field in update_data for field in ["title", "content", "section", "clause_number"]):
        try:
            await apply_embeddings(db, [knowledge])
        except Exception as exc:
            logger.warning(f"Embedding generation failed for knowledge update: {exc}")
    
    # Р›РѕРіРёСЂРѕРІР°РЅРёРµ
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
    """РЈРґР°Р»РёС‚СЊ СЌР»РµРјРµРЅС‚ Р±Р°Р·С‹ Р·РЅР°РЅРёР№"""
    await require_permission(current_user, "knowledge:delete", db)
    
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == knowledge_id))
    knowledge = result.scalar_one_or_none()
    
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge base item not found")
    
    # Р›РѕРіРёСЂРѕРІР°РЅРёРµ
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




