import logging
import math
import os
import re
from datetime import datetime
from typing import List, Optional, Sequence, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.models import KnowledgeBase
    from backend.ai_client import get_ai_client_async
except ImportError:
    from .models import KnowledgeBase
    from .ai_client import get_ai_client_async

logger = logging.getLogger(__name__)


def get_embedding_model() -> str:
    return os.getenv("AI_EMBEDDING_MODEL", "text-embedding-3-small")


def _max_chars() -> int:
    try:
        return int(os.getenv("AI_EMBEDDING_MAX_CHARS", "4000"))
    except ValueError:
        return 4000


def build_embedding_text(item: KnowledgeBase) -> str:
    parts = [
        item.title or "",
        item.section or "",
        item.clause_number or "",
        item.content or "",
    ]
    text = " ".join([p for p in parts if p])
    text = re.sub(r"\s+", " ", text).strip()
    limit = _max_chars()
    return text[:limit]


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b or len(a) != len(b):
        return -1.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    denom = math.sqrt(norm_a) * math.sqrt(norm_b)
    return dot / denom if denom else -1.0


async def embed_texts(db: AsyncSession, texts: List[str]) -> Optional[List[List[float]]]:
    if not texts:
        return []
    if os.getenv("AI_EMBEDDINGS_ENABLED", "true").lower() != "true":
        return None
    try:
        ai_client = await get_ai_client_async(db)
        if not ai_client or not hasattr(ai_client, "generate_embeddings"):
            return None
        return ai_client.generate_embeddings(texts, model=get_embedding_model())
    except Exception as exc:
        logger.warning(f"AI embedding generation failed: {exc}")
        return None


async def apply_embeddings(db: AsyncSession, items: List[KnowledgeBase]) -> bool:
    if not items:
        return False
    texts = [build_embedding_text(item) for item in items]
    embeddings = await embed_texts(db, texts)
    if not embeddings:
        return False
    model = get_embedding_model()
    now = datetime.utcnow()
    for item, emb in zip(items, embeddings):
        item.embedding = emb
        item.embedding_model = model
        item.embedding_updated_at = now
    await db.flush()
    return True


async def semantic_search_knowledge(
    db: AsyncSession,
    query: str,
    document_type: Optional[str] = None,
    limit: int = 10,
    candidates_limit: Optional[int] = None,
    backfill: bool = True,
) -> List[KnowledgeBase]:
    if not query or not query.strip():
        return []

    query_embedding = await embed_texts(db, [query.strip()])
    if not query_embedding:
        return []
    query_vector = query_embedding[0]

    if candidates_limit is None:
        try:
            candidates_limit = int(os.getenv("AI_SEMANTIC_CANDIDATES", "500"))
        except ValueError:
            candidates_limit = 500

    stmt = select(KnowledgeBase)
    if document_type:
        stmt = stmt.where(KnowledgeBase.document_type == document_type)
    result = await db.execute(stmt.limit(candidates_limit))
    items = result.scalars().all()
    if not items:
        return []

    missing = [item for item in items if not getattr(item, "embedding", None)]
    if missing and backfill:
        try:
            backfill_limit = int(os.getenv("AI_SEMANTIC_BACKFILL_LIMIT", "50"))
        except ValueError:
            backfill_limit = 50
        batch = missing[:backfill_limit]
        updated = await apply_embeddings(db, batch)
        if updated:
            await db.commit()

    scored: List[Tuple[float, KnowledgeBase]] = []
    for item in items:
        emb = getattr(item, "embedding", None)
        if not emb or not isinstance(emb, (list, tuple)):
            continue
        score = cosine_similarity(query_vector, emb)
        if score > -0.5:
            scored.append((score, item))

    if not scored:
        return []

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored[:limit]]
