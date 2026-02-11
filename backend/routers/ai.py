"""
Универсальный AI роутер для генерации текста
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from datetime import datetime, timedelta
import re
import html
import httpx
import uuid

# Поддержка запуска как скрипта и как модуля
try:
    from backend.models import User, UserActivity, Equipment, Violation, File, KnowledgeBase, Act, ActViolation, Report, Inspection, Task
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
    from backend.ai_client import get_ai_client_async
    from backend.knowledge_semantic import semantic_search_knowledge
except ImportError:
    from ..models import User, UserActivity, Equipment, Violation, File, KnowledgeBase, Act, ActViolation, Report, Inspection, Task
    from ..database import get_db
    from ..auth import get_current_user, require_permission
    from ..ai_client import get_ai_client_async
    from ..knowledge_semantic import semantic_search_knowledge

router = APIRouter(prefix="/api/ai", tags=["ai"])

def _normalize_russian_terms(text: str) -> str:
    if not text:
        return text
    replacements = [
        (r"\bstatus\b", "статус"),
        (r"\bcreated_at\b", "дата создания"),
        (r"\bupdated_at\b", "дата обновления"),
        (r"\bseverity\b", "критичность"),
        (r"\bin_progress\b", "в работе"),
        (r"\bopen\b", "открыто"),
        (r"\bclosed\b", "закрыто"),
        (r"\bresolved\b", "устранено"),
        (r"\bdraft\b", "черновик"),
        (r"\bsigned\b", "подписано"),
        (r"\barchived\b", "архив"),
        (r"\bdue_date\b", "срок исполнения"),
        (r"\bpriority\b", "приоритет"),
        (r"\bmedium\b", "средняя"),
        (r"\blow\b", "низкая"),
        (r"\bhigh\b", "высокая"),
        (r"\bcritical\b", "критичная"),
    ]
    normalized = text
    for pattern, replacement in replacements:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)
    return normalized

def _wants_full_list(message: str) -> bool:
    msg = (message or "").lower()
    return any(phrase in msg for phrase in [
        "все", "весь список", "полный список", "перечень", "список всех", "полностью"
    ])

def _contains_any(message: str, keywords: List[str]) -> bool:
    msg = (message or "").lower()
    return any(k in msg for k in keywords)

async def _build_internal_fallback(db: AsyncSession, message: str) -> str:
    if not message:
        return ""
    now = datetime.utcnow()
    lines: List[str] = []

    wants_overdue_violations = _contains_any(message, ["нарушен", "просроч", "срок устран", "дедлайн"])
    wants_overdue_tasks = _contains_any(message, ["задач", "поручен", "исполн", "срок", "дедлайн"])

    if wants_overdue_violations:
        overdue_total = (await db.execute(
            select(func.count()).select_from(Violation).where(
                Violation.status != "resolved",
                Violation.deadline.isnot(None),
                Violation.deadline < now
            )
        )).scalar() or 0
        without_deadline = (await db.execute(
            select(func.count()).select_from(Violation).where(
                Violation.status != "resolved",
                Violation.deadline.is_(None)
            )
        )).scalar() or 0
        rows = (await db.execute(
            select(Violation).where(
                Violation.status != "resolved",
                Violation.deadline.isnot(None),
                Violation.deadline < now
            ).order_by(Violation.deadline.asc()).limit(10)
        )).scalars().all()
        lines.append("Краткий отчет по просроченным нарушениям:")
        lines.append(f"- всего просроченных: {overdue_total}")
        if rows:
            lines.append("- примеры:")
            for v in rows:
                deadline = v.deadline.date() if v.deadline else "—"
                desc = re.sub(r"\s+", " ", v.description or "").strip()
                lines.append(
                    f"  - id={v.id}; срок={deadline}; критичность={v.severity}; статус={v.status}; описание={desc[:140]}"
                )
        else:
            lines.append("- просроченных нарушений не найдено.")
        if without_deadline > 0:
            lines.append(f"- у {without_deadline} нарушений нет срока устранения.")

    if wants_overdue_tasks:
        overdue_total = (await db.execute(
            select(func.count()).select_from(Task).where(
                Task.status != "completed",
                Task.due_date.isnot(None),
                Task.due_date < now
            )
        )).scalar() or 0
        rows = (await db.execute(
            select(Task).where(
                Task.status != "completed",
                Task.due_date.isnot(None),
                Task.due_date < now
            ).order_by(Task.due_date.asc()).limit(10)
        )).scalars().all()
        if lines:
            lines.append("")
        lines.append("Краткий отчет по просроченным задачам:")
        lines.append(f"- всего просроченных: {overdue_total}")
        if rows:
            lines.append("- примеры:")
            for t in rows:
                due = t.due_date.date() if t.due_date else "—"
                title = (t.title or "").strip()
                lines.append(
                    f"  - id={t.id}; срок={due}; приоритет={t.priority}; статус={t.status}; название={title[:120]}"
                )
        else:
            lines.append("- просроченных задач не найдено.")

    return "\n".join(lines)

async def _build_domain_context(db: AsyncSession, message: str) -> tuple[str, List[str]]:
    if not message:
        return "", []
    now = datetime.utcnow()
    limit_base = int(os.getenv("AI_SECTION_LIMIT", "50"))
    limit = 200 if _wants_full_list(message) else limit_base
    parts: List[str] = []
    sources: List[str] = []

    wants_violations = _contains_any(message, ["нарушен", "просроч", "срок устран", "дедлайн"])
    wants_tasks = _contains_any(message, ["задач", "поручен", "исполн", "срок"])
    wants_acts = _contains_any(message, ["акт"])
    wants_inspections = _contains_any(message, ["осмотр", "инспек"])
    wants_equipment = _contains_any(message, ["оборуд", "пто", "что", "техосмотр"])

    if wants_violations:
        query = select(Violation)
        if _contains_any(message, ["просроч", "срок устран", "дедлайн"]):
            query = query.where(
                Violation.status != "resolved",
                Violation.deadline.isnot(None),
                Violation.deadline < now
            ).order_by(Violation.deadline.asc())
            header = "НАРУШЕНИЯ_ПРОСРОЧЕНО:"
        else:
            query = query.order_by(Violation.created_at.desc())
            header = "НАРУШЕНИЯ:"
        rows = (await db.execute(query.limit(limit))).scalars().all()
        parts.append(header)
        if rows:
            for v in rows:
                desc = re.sub(r"\s+", " ", v.description or "").strip()
                deadline = v.deadline.date() if v.deadline else "—"
                parts.append(
                    f"- id={v.id}; статус={v.status}; критичность={v.severity}; срок={deadline}; дата_создания={v.created_at.date()}; описание={desc[:160]}"
                )
                sources.append(f"нарушение #{v.id}")
        else:
            parts.append("- нет данных")

    if wants_tasks:
        query = select(Task)
        if _contains_any(message, ["просроч", "срок", "дедлайн"]):
            query = query.where(
                Task.status != "completed",
                Task.due_date.isnot(None),
                Task.due_date < now
            ).order_by(Task.due_date.asc())
            header = "ЗАДАЧИ_ПРОСРОЧЕНО:"
        else:
            query = query.order_by(Task.created_at.desc())
            header = "ЗАДАЧИ:"
        rows = (await db.execute(query.limit(limit))).scalars().all()
        parts.append(header)
        if rows:
            for t in rows:
                due = t.due_date.date() if t.due_date else "—"
                parts.append(
                    f"- id={t.id}; статус={t.status}; приоритет={t.priority}; срок={due}; дата_создания={t.created_at.date()}; название={t.title[:120]}"
                )
                sources.append(f"задача #{t.id}")
        else:
            parts.append("- нет данных")

    if wants_acts:
        rows = (await db.execute(
            select(Act).order_by(Act.created_at.desc()).limit(limit)
        )).scalars().all()
        parts.append("АКТЫ:")
        if rows:
            for a in rows:
                parts.append(
                    f"- id={a.id}; номер={a.act_number}; статус={a.status}; дата={a.act_date.date() if a.act_date else '—'}; организация={a.organization}"
                )
                sources.append(f"акт #{a.id}")
        else:
            parts.append("- нет данных")

    if wants_inspections:
        rows = (await db.execute(
            select(Inspection).order_by(Inspection.created_at.desc()).limit(limit)
        )).scalars().all()
        parts.append("ОСМОТРЫ:")
        if rows:
            for i in rows:
                parts.append(
                    f"- id={i.id}; статус={i.status}; дата_создания={i.created_at.date()}; дата_завершения={i.completed_at.date() if i.completed_at else '—'}"
                )
                sources.append(f"осмотр #{i.id}")
        else:
            parts.append("- нет данных")

    if wants_equipment:
        rows = (await db.execute(
            select(Equipment).order_by(Equipment.updated_at.desc()).limit(limit)
        )).scalars().all()
        parts.append("ОБОРУДОВАНИЕ:")
        if rows:
            for e in rows:
                pto = e.pto_date.date() if e.pto_date else "—"
                cto = e.cto_date.date() if e.cto_date else "—"
                parts.append(
                    f"- id={e.id}; паспорт={e.passport_number}; тип={e.equipment_type}; статус={e.status}; ПТО={pto}; ЧТО={cto}; цех={e.workshop or '—'}"
                )
                sources.append(f"оборудование #{e.id}")
        else:
            parts.append("- нет данных")

    if not parts:
        return "", []
    return "\n".join(["DOMAIN_CONTEXT:"] + parts), sources

class AIGenerateRequest(BaseModel):
    prompt: str
    context: Optional[str] = None
    max_tokens: Optional[int] = 1000
    temperature: Optional[float] = 0.7
    parent_message_id: Optional[str] = None  # Для Timeweb Cloud агентов (контекст чата)

class AIGenerateResponse(BaseModel):
    result: str

class AIClassifyViolationRequest(BaseModel):
    text: str
    photo_ids: Optional[List[int]] = None

class AIClassifyViolationResponse(BaseModel):
    type: str
    severity: str
    gost_reference: Optional[str]
    confidence: float

class AIVoiceToTextRequest(BaseModel):
    audio_file_id: int

class AIVoiceToTextResponse(BaseModel):
    text: str
    checklist_items: Dict[str, Any]
    confidence: float

class AIEquipmentRiskRequest(BaseModel):
    equipment_id: int

class AIEquipmentRiskResponse(BaseModel):
    risk_score: int
    factors: List[str]
    recommendation: str

class AIChatMessage(BaseModel):
    role: str
    content: str

class AIChatRequest(BaseModel):
    message: str
    history: Optional[List[AIChatMessage]] = []
    context: Optional[str] = None
    response_mode: Optional[str] = "brief"

class AIChatResponse(BaseModel):
    answer: str
    web_fallback: bool = False
    web_query: Optional[str] = None

class AISuggestionsResponse(BaseModel):
    suggestions: List[str]
    stats: Dict[str, Any]
    generated_at: str

class AIActionSelection(BaseModel):
    type: Optional[str] = None
    id: Optional[int] = None
    label: Optional[str] = None

class AIActionSuggestRequest(BaseModel):
    selection: Optional[AIActionSelection] = None
    page: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    context: Optional[str] = None

class AIActionProposal(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    action_type: str
    endpoint: str
    method: str = "post"
    payload: Dict[str, Any]
    warnings: Optional[List[str]] = None
    meta: Optional[Dict[str, Any]] = None

class AIActionSuggestResponse(BaseModel):
    proposals: List[AIActionProposal]
    generated_at: str

def _user_has_role(user: User, role_names: List[str]) -> bool:
    try:
        roles = [ur.role.name for ur in (user.roles or [])]
        return any(r in role_names for r in roles)
    except Exception:
        return False

def _normalize_selection_type(selection_type: Optional[str]) -> Optional[str]:
    if not selection_type:
        return None
    text = selection_type.strip().lower()
    if any(key in text for key in ["наруш", "violation"]):
        return "violation"
    if any(key in text for key in ["оборуд", "equipment"]):
        return "equipment"
    if any(key in text for key in ["акт", "act"]):
        return "act"
    if any(key in text for key in ["осмотр", "inspection"]):
        return "inspection"
    if any(key in text for key in ["задач", "task"]):
        return "task"
    return None

def _default_task_priority(violation_severity: str) -> str:
    if violation_severity == "critical":
        return "urgent"
    if violation_severity == "high":
        return "high"
    if violation_severity == "low":
        return "low"
    return "medium"

def _iso_or_none(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    try:
        return value.isoformat()
    except Exception:
        return None

async def _has_open_task(db: AsyncSession, violation_id: int) -> bool:
    result = await db.execute(
        select(Task.id).where(
            Task.violation_id == violation_id,
            Task.status.in_(["open", "in_work"]),
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None

async def _has_draft_act(db: AsyncSession, violation_id: int) -> bool:
    result = await db.execute(
        select(Act.id)
        .join(ActViolation, ActViolation.act_id == Act.id)
        .where(
            ActViolation.violation_id == violation_id,
            Act.status == "draft",
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None

def _build_task_proposal(violation: Violation) -> AIActionProposal:
    short_desc = re.sub(r"\s+", " ", violation.description or "").strip()
    title = violation.violation_type or violation.violation_type_description or short_desc[:120]
    if title:
        title = f"Устранить нарушение #{violation.id}: {title}"
    else:
        title = f"Устранить нарушение #{violation.id}"
    warnings: List[str] = []
    if not violation.deadline:
        warnings.append("Срок устранения не указан")
    payload = {
        "title": title,
        "description": violation.description or None,
        "due_date": _iso_or_none(violation.deadline),
        "priority": _default_task_priority(violation.severity),
        "force_create": False,
    }
    return AIActionProposal(
        id=f"task:{violation.id}:{uuid.uuid4().hex[:8]}",
        title=f"Создать задачу по нарушению #{violation.id}",
        description="Нарушение открыто, активной задачи на устранение нет.",
        action_type="create_task_from_violation",
        endpoint=f"/api/workflow/violations/{violation.id}/task",
        payload=payload,
        warnings=warnings or None,
        meta={
            "violation_id": violation.id,
            "equipment_id": violation.equipment_id,
            "severity": violation.severity,
        },
    )

def _build_act_proposal(violation: Violation, current_user: User) -> AIActionProposal:
    payload = {
        "organization": (current_user.organization or None),
        "force_create": False,
    }
    return AIActionProposal(
        id=f"act:{violation.id}:{uuid.uuid4().hex[:8]}",
        title=f"Создать черновик акта по нарушению #{violation.id}",
        description="Черновик акта по нарушению отсутствует.",
        action_type="create_act_from_violation",
        endpoint=f"/api/workflow/violations/{violation.id}/act",
        payload=payload,
        warnings=None,
        meta={
            "violation_id": violation.id,
            "equipment_id": violation.equipment_id,
            "severity": violation.severity,
        },
    )

async def _build_action_proposals_for_violation(
    db: AsyncSession,
    violation: Violation,
    current_user: User,
) -> List[AIActionProposal]:
    proposals: List[AIActionProposal] = []
    if not violation or violation.status == "resolved":
        return proposals
    if not await _has_open_task(db, violation.id):
        proposals.append(_build_task_proposal(violation))
    if not await _has_draft_act(db, violation.id):
        proposals.append(_build_act_proposal(violation, current_user))
    return proposals

@router.post("/actions/suggest", response_model=AIActionSuggestResponse)
async def ai_action_suggest(
    request: AIActionSuggestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not _user_has_role(current_user, ["admin", "inspector"]):
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    proposals: List[AIActionProposal] = []
    max_actions = int(os.getenv("AI_ACTION_LIMIT", "6"))

    selection_type = _normalize_selection_type(request.selection.type if request.selection else None)
    selection_id = request.selection.id if request.selection else None

    if selection_type == "violation" and selection_id:
        violation_result = await db.execute(select(Violation).where(Violation.id == selection_id))
        violation = violation_result.scalar_one_or_none()
        if violation:
            proposals = await _build_action_proposals_for_violation(db, violation, current_user)
    elif selection_type == "equipment" and selection_id:
        violations_result = await db.execute(
            select(Violation)
            .where(
                Violation.equipment_id == selection_id,
                Violation.status != "resolved",
            )
            .order_by(Violation.created_at.desc())
            .limit(25)
        )
        for violation in violations_result.scalars().all():
            proposals.extend(await _build_action_proposals_for_violation(db, violation, current_user))
            if len(proposals) >= max_actions:
                break
    else:
        violations_result = await db.execute(
            select(Violation)
            .where(Violation.status != "resolved")
            .order_by(Violation.created_at.desc())
            .limit(25)
        )
        for violation in violations_result.scalars().all():
            proposals.extend(await _build_action_proposals_for_violation(db, violation, current_user))
            if len(proposals) >= max_actions:
                break

    proposals = proposals[:max_actions]

    db.add(
        UserActivity(
            user_id=current_user.id,
            action_type="read",
            entity_type="ai_action_suggest",
            description=f"AI action suggestions: {len(proposals)}",
        )
    )
    await db.commit()

    return AIActionSuggestResponse(
        proposals=proposals,
        generated_at=datetime.utcnow().isoformat(),
    )

async def _build_project_context(db: AsyncSession) -> str:
    # Aggregate small context to avoid token bloat
    now = datetime.utcnow()
    equipment_count = (await db.execute(select(func.count(Equipment.id)))).scalar() or 0
    violations_count = (await db.execute(select(func.count(Violation.id)))).scalar() or 0
    inspections_count = (await db.execute(select(func.count(Inspection.id)))).scalar() or 0
    acts_count = (await db.execute(select(func.count(Act.id)))).scalar() or 0
    reports_count = (await db.execute(select(func.count(Report.id)))).scalar() or 0
    knowledge_count = (await db.execute(select(func.count(KnowledgeBase.id)))).scalar() or 0

    violations_open = (await db.execute(
        select(func.count()).select_from(Violation).where(Violation.status != "resolved")
    )).scalar() or 0
    violations_overdue = (await db.execute(
        select(func.count()).select_from(Violation).where(
            Violation.status != "resolved",
            Violation.deadline.isnot(None),
            Violation.deadline < now
        )
    )).scalar() or 0
    violations_without_deadline = (await db.execute(
        select(func.count()).select_from(Violation).where(
            Violation.status != "resolved",
            Violation.deadline.is_(None)
        )
    )).scalar() or 0
    
    recent_violations = (await db.execute(
        select(Violation).order_by(Violation.created_at.desc()).limit(5)
    )).scalars().all()
    overdue_violations = (await db.execute(
        select(Violation).where(
            Violation.status != "resolved",
            Violation.deadline.isnot(None),
            Violation.deadline < now
        ).order_by(Violation.deadline.asc()).limit(5)
    )).scalars().all()
    recent_acts = (await db.execute(
        select(Act).order_by(Act.created_at.desc()).limit(5)
    )).scalars().all()
    recent_reports = (await db.execute(
        select(Report).order_by(Report.created_at.desc()).limit(5)
    )).scalars().all()
    
    context_lines = [
        "PROJECT_SNAPSHOT:",
        f"equipment_count={equipment_count}",
        f"violations_count={violations_count}",
        f"violations_open={violations_open}",
        f"violations_overdue={violations_overdue}",
        f"violations_without_deadline={violations_without_deadline}",
        f"inspections_count={inspections_count}",
        f"acts_count={acts_count}",
        f"reports_count={reports_count}",
        f"knowledge_items={knowledge_count}",
        "",
        "RECENT_VIOLATIONS:",
    ]
    for v in recent_violations:
        description = re.sub(r"\s+", " ", v.description or "").strip()
        context_lines.append(
            f"- id={v.id}; критичность={v.severity}; статус={v.status}; дата_создания={v.created_at.date()}; описание={description[:120]}"
        )

    context_lines.append("")
    context_lines.append("OVERDUE_VIOLATIONS:")
    if overdue_violations:
        for v in overdue_violations:
            description = re.sub(r"\s+", " ", v.description or "").strip()
            deadline = v.deadline.date() if v.deadline else "—"
            context_lines.append(
                f"- id={v.id}; критичность={v.severity}; статус={v.status}; срок={deadline}; дата_создания={v.created_at.date()}; описание={description[:120]}"
            )
    else:
        context_lines.append("- нет")
    
    context_lines.append("")
    context_lines.append("RECENT_ACTS:")
    for a in recent_acts:
        context_lines.append(
            f"- id={a.id}; act_number={a.act_number}; status={a.status}; act_date={a.act_date}; org={a.organization}"
        )
    
    context_lines.append("")
    context_lines.append("RECENT_REPORTS:")
    for r in recent_reports:
        context_lines.append(
            f"- id={r.id}; type={r.report_type}; status={r.status}; created_at={r.created_at}; format={r.file_format}"
        )
    
    return "\n".join(context_lines)

async def _search_knowledge_base(db: AsyncSession, query_text: str, limit: int = 6) -> List[KnowledgeBase]:
    if not query_text or not query_text.strip():
        return []
    try:
        semantic_results = await semantic_search_knowledge(db, query_text, limit=limit, backfill=False)
        if semantic_results:
            return semantic_results
    except Exception:
        pass
    query = select(KnowledgeBase).where(
        or_(
            KnowledgeBase.title.ilike(f"%{query_text}%"),
            KnowledgeBase.content.ilike(f"%{query_text}%"),
            KnowledgeBase.section.ilike(f"%{query_text}%"),
            KnowledgeBase.clause_number.ilike(f"%{query_text}%")
        )
    ).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

def _build_knowledge_context(items: List[KnowledgeBase], max_chars: int = 5000) -> str:
    if not items:
        return ""
    parts = ["\n\n=== РЕЛЕВАНТНАЯ ДОКУМЕНТАЦИЯ ИЗ БАЗЫ ЗНАНИЙ ===\n"]
    used = 0
    for item in items:
        header = f"[{item.document_type.upper()}] {item.title}"
        meta = []
        if item.section:
            meta.append(f"Раздел: {item.section}")
        if item.clause_number:
            meta.append(f"Пункт: {item.clause_number}")
        meta_text = "\n".join(meta) + "\n" if meta else ""
        snippet = (item.content or "")[:800]
        block = f"{header}\n{meta_text}{snippet}\n\n"
        if used + len(block) > max_chars:
            break
        parts.append(block)
        used += len(block)
    return "".join(parts)

async def _web_search_duckduckgo(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    if not query or not query.strip():
        return []
    url = "https://duckduckgo.com/html/"
    params = {"q": query}
    results = []
    try:
        async with httpx.AsyncClient(timeout=15.0, headers={"User-Agent": "InspectorHubBot/1.0"}) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            text = resp.text
    except Exception:
        return []
    
    links = re.findall(r'class=\"result__a\" href=\"(.*?)\".*?>(.*?)<', text)
    snippets = re.findall(r'class=\"result__snippet\".*?>(.*?)<', text)
    
    for i, (link, title) in enumerate(links[:max_results]):
        snippet = snippets[i] if i < len(snippets) else ""
        results.append({
            "title": html.unescape(re.sub(r"<.*?>", "", title)),
            "link": html.unescape(link),
            "snippet": html.unescape(re.sub(r"<.*?>", "", snippet)),
        })
    return results

@router.get("/test")
async def test_ai_connection(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Тестирование подключения к AI"""
    # Проверяем авторизацию пользователя
    if not current_user:
        return {
            "status": "error",
            "message": "Не авторизован. Войдите в систему.",
            "provider": None,
            "configured": False
        }
    
    try:
        # Получаем AI клиент
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            return {
                "status": "error",
                "message": "AI не настроен. Перейдите в раздел 'Настройки' -> 'Системные настройки' и настройте AI провайдера.",
                "provider": None,
                "configured": False
            }
        
        # Пробуем простой запрос
        test_prompt = "Привет! Ответь одним предложением: ты работаешь?"
        
        # Собираем информацию о настройках для диагностики
        config_info = {
            "provider": ai_client.provider,
            "has_api_key": bool(ai_client.api_key),
            "api_key_length": len(ai_client.api_key) if ai_client.api_key else 0,
            "base_url": ai_client.base_url,
        }
        
        # Для Timeweb добавляем информацию об агенте
        if ai_client.provider == "timeweb":
            config_info["has_agent_access_id"] = bool(getattr(ai_client, 'agent_access_id', None))
            config_info["agent_access_id_length"] = len(ai_client.agent_access_id) if getattr(ai_client, 'agent_access_id', None) else 0
            config_info["uses_agent_api"] = getattr(ai_client, 'use_agent_api', False)
        
        try:
            result = ai_client.generate_text(
                prompt=test_prompt,
                system_prompt="Ты помощник. Отвечай кратко и по делу. Ответ только на русском.",
                max_tokens=200,  # Увеличили лимит для теста
                temperature=0.7
            )
            
            return {
                "status": "success",
                "message": "AI успешно подключен и работает!",
                "provider": ai_client.provider,
                "test_response": result[:100] if result else "Нет ответа",
                "configured": True,
                "config_info": config_info
            }
        except Exception as e:
            error_msg = str(e)
            # Разбиваем длинные сообщения на строки для лучшей читаемости
            if "\n" in error_msg:
                error_msg = error_msg.split("\n")
            
            return {
                "status": "error",
                "message": f"Ошибка при тестировании AI: {error_msg[0] if isinstance(error_msg, list) else error_msg}",
                "provider": ai_client.provider,
                "configured": True,
                "error": error_msg,
                "config_info": config_info,
                "details": error_msg if isinstance(error_msg, list) else None
            }
    
    except Exception as e:
        return {
            "status": "error",
            "message": f"Ошибка инициализации AI: {str(e)}",
            "provider": None,
            "configured": False,
            "error": str(e)
        }

@router.get("/suggestions", response_model=AISuggestionsResponse)
async def ai_suggestions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not _user_has_role(current_user, ["admin", "inspector"]):
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    now = datetime.utcnow()
    last_30 = now - timedelta(days=30)
    next_30 = now + timedelta(days=30)

    async def count(query):
        result = await db.execute(query)
        return result.scalar() or 0

    violations_total = await count(select(func.count()).select_from(Violation))
    violations_open = await count(
        select(func.count()).select_from(Violation).where(Violation.status != "resolved")
    )
    violations_overdue = await count(
        select(func.count()).select_from(Violation).where(
            Violation.status != "resolved",
            Violation.deadline.isnot(None),
            Violation.deadline < now
        )
    )
    violations_no_deadline = await count(
        select(func.count()).select_from(Violation).where(
            Violation.status != "resolved",
            Violation.deadline.is_(None)
        )
    )

    tasks_total = await count(select(func.count()).select_from(Task))
    tasks_open = await count(
        select(func.count()).select_from(Task).where(Task.status != "completed")
    )
    tasks_overdue = await count(
        select(func.count()).select_from(Task).where(
            Task.status != "completed",
            Task.due_date.isnot(None),
            Task.due_date < now
        )
    )
    tasks_no_due = await count(
        select(func.count()).select_from(Task).where(
            Task.status != "completed",
            Task.due_date.is_(None)
        )
    )

    acts_draft = await count(select(func.count()).select_from(Act).where(Act.status == "draft"))
    acts_signed = await count(select(func.count()).select_from(Act).where(Act.status == "signed"))
    acts_archived = await count(select(func.count()).select_from(Act).where(Act.status == "archived"))

    inspections_in_progress = await count(
        select(func.count()).select_from(Inspection).where(Inspection.status != "completed")
    )
    inspections_recent = await count(
        select(func.count()).select_from(Inspection).where(Inspection.created_at >= last_30)
    )

    equipment_total = await count(select(func.count()).select_from(Equipment))
    equipment_inactive = await count(select(func.count()).select_from(Equipment).where(Equipment.status == "inactive"))
    equipment_archived = await count(select(func.count()).select_from(Equipment).where(Equipment.status == "archived"))
    equipment_pto_due = await count(
        select(func.count()).select_from(Equipment).where(
            Equipment.pto_date.isnot(None),
            Equipment.pto_date >= now,
            Equipment.pto_date <= next_30
        )
    )
    equipment_cto_due = await count(
        select(func.count()).select_from(Equipment).where(
            Equipment.cto_date.isnot(None),
            Equipment.cto_date >= now,
            Equipment.cto_date <= next_30
        )
    )
    equipment_pto_overdue = await count(
        select(func.count()).select_from(Equipment).where(
            Equipment.pto_date.isnot(None),
            Equipment.pto_date < now
        )
    )
    equipment_cto_overdue = await count(
        select(func.count()).select_from(Equipment).where(
            Equipment.cto_date.isnot(None),
            Equipment.cto_date < now
        )
    )

    knowledge_total = await count(select(func.count()).select_from(KnowledgeBase))
    knowledge_recent = await count(
        select(func.count()).select_from(KnowledgeBase).where(KnowledgeBase.updated_at >= last_30)
    )

    suggestions: List[str] = []

    def add(text: str):
        if text and len(suggestions) < 6 and text not in suggestions:
            suggestions.append(text)

    if violations_overdue > 0:
        add(f"Сделай краткий отчет по просроченным нарушениям (срок устранения прошел): {violations_overdue}")
    elif violations_open > 0:
        add(f"Сводка по открытым нарушениям и срокам устранения: {violations_open}")

    if violations_no_deadline > 0:
        add(f"Список нарушений без срока устранения: {violations_no_deadline}")

    if tasks_overdue > 0:
        add(f"Покажи просроченные задачи по устранению: {tasks_overdue}")
    elif tasks_open > 0:
        add(f"Сводка по задачам в работе и открытым: {tasks_open}")

    if tasks_no_due > 0:
        add(f"Список задач без срока исполнения: {tasks_no_due}")

    if acts_draft > 0:
        add(f"Список актов в черновике и что нужно для подписания: {acts_draft}")

    if inspections_in_progress > 0:
        add(f"Отчет по осмотрам в работе: {inspections_in_progress}")
    elif inspections_recent > 0:
        add(f"Краткая сводка по осмотрам за последние 30 дней: {inspections_recent}")

    if equipment_pto_overdue + equipment_cto_overdue > 0:
        add(f"ПТО/ЧТО просрочены: {equipment_pto_overdue + equipment_cto_overdue}")
    elif equipment_pto_due + equipment_cto_due > 0:
        add(f"ПТО/ЧТО в ближайшие 30 дней: {equipment_pto_due + equipment_cto_due}")

    if equipment_inactive + equipment_archived > 0:
        add(f"Список неактивного и архивного оборудования: {equipment_inactive + equipment_archived}")

    if knowledge_recent > 0:
        add(f"Что нового в базе знаний за 30 дней: {knowledge_recent}")

    if not suggestions:
        add("Сделай краткую сводку по текущим рискам и нарушениям")
        add("Подготовь общий отчет по статусам оборудования")

    stats = {
        "violations": {
            "total": violations_total,
            "open": violations_open,
            "overdue": violations_overdue,
            "without_deadline": violations_no_deadline
        },
        "tasks": {
            "total": tasks_total,
            "open": tasks_open,
            "overdue": tasks_overdue,
            "without_due": tasks_no_due
        },
        "acts": {
            "draft": acts_draft,
            "signed": acts_signed,
            "archived": acts_archived
        },
        "inspections": {
            "in_progress": inspections_in_progress,
            "last_30_days": inspections_recent
        },
        "equipment": {
            "total": equipment_total,
            "inactive": equipment_inactive,
            "archived": equipment_archived,
            "pto_due_30": equipment_pto_due,
            "cto_due_30": equipment_cto_due,
            "pto_overdue": equipment_pto_overdue,
            "cto_overdue": equipment_cto_overdue
        },
        "knowledge_base": {
            "total": knowledge_total,
            "updated_30_days": knowledge_recent
        }
    }

    return AISuggestionsResponse(
        suggestions=suggestions,
        stats=stats,
        generated_at=now.isoformat()
    )

@router.post("/generate", response_model=AIGenerateResponse)
async def generate_text(
    request: AIGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Универсальная генерация текста через AI"""
    # Проверяем права (любой авторизованный пользователь может использовать AI)
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Текст запроса обязателен")
    
    try:
        # Получаем AI клиент
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            raise HTTPException(
                status_code=400,
                detail="AI не настроен. Перейдите в раздел 'Настройки' -> 'Системные настройки' и настройте AI провайдера."
            )
        
        # Получаем релевантную информацию из базы знаний
        knowledge_context = ""
        try:
            try:
                from backend.models import KnowledgeBase
            except ImportError:
                from ..models import KnowledgeBase
            
            # Ищем релевантные документы в базе знаний
            query = select(KnowledgeBase).limit(10)
            if request.context:
                # Поиск по контексту
                query = query.where(
                    or_(
                        KnowledgeBase.title.ilike(f"%{request.context}%"),
                        KnowledgeBase.content.ilike(f"%{request.context}%"),
                        KnowledgeBase.section.ilike(f"%{request.context}%")
                    )
                )
            
            result = await db.execute(query)
            knowledge_items = result.scalars().all()
            
            if knowledge_items:
                # Формируем контекст из базы знаний (расширенный для лучшего понимания)
                knowledge_context = "\n\n=== РЕЛЕВАНТНАЯ ДОКУМЕНТАЦИЯ ИЗ БАЗЫ ЗНАНИЙ ===\n"
                
                # Функция для умного извлечения релевантных частей
                def extract_relevant_content(content: str, search_context: str, max_length: int = 8000) -> str:
                    """Извлекает релевантные части документа"""
                    if not search_context or not search_context.strip():
                        return content[:max_length] + ("..." if len(content) > max_length else "")
                    
                    # Простой поиск по ключевым словам из контекста
                    keywords = [w.lower() for w in search_context.split() if len(w) > 3]
                    if not keywords:
                        return content[:max_length] + ("..." if len(content) > max_length else "")
                    
                    content_lower = content.lower()
                    relevant_parts = []
                    
                    for keyword in keywords[:5]:  # Берем до 5 ключевых слов
                        pos = content_lower.find(keyword)
                        if pos != -1:
                            start = max(0, pos - 1500)
                            end = min(len(content), pos + len(keyword) + 1500)
                            relevant_parts.append((start, end))
                    
                    if relevant_parts:
                        relevant_parts.sort()
                        # Объединяем части
                        result = content[relevant_parts[0][0]:relevant_parts[-1][1]]
                        if len(result) > max_length:
                            result = result[:max_length] + "\n[Документ продолжается]"
                        return result
                    else:
                        return content[:max_length] + ("..." if len(content) > max_length else "")
                
                # Увеличиваем количество документов для лучшего понимания контекста
                for item in knowledge_items[:12]:  # Берем до 12 документов
                    doc_type_name = {
                        "fnp461": "ФНП 461",
                        "gost": "ГОСТ",
                        "manual": "Методичка"
                    }.get(item.document_type, item.document_type.upper())
                    
                    knowledge_context += f"\n{'='*50}\n[{doc_type_name}] {item.title}\n{'='*50}\n"
                    if item.section:
                        knowledge_context += f"Раздел: {item.section}\n"
                    if item.clause_number:
                        knowledge_context += f"Пункт: {item.clause_number}\n"
                    knowledge_context += "\n"
                    
                    # Умное извлечение контента:
                    # - ФНП/ГОСТ: до 8000 символов релевантных частей
                    # - Остальные: до 4000 символов
                    if item.document_type in ["fnp461", "gost"]:
                        content_preview = extract_relevant_content(
                            item.content,
                            request.context or "",
                            max_length=8000
                        )
                    else:
                        content_preview = extract_relevant_content(
                            item.content,
                            request.context or "",
                            max_length=4000
                        )
                    
                    knowledge_context += f"{content_preview}\n\n"
        except Exception as e:
            # Если не удалось загрузить базу знаний, продолжаем без неё
            import logging
            logging.getLogger(__name__).warning(f"Не удалось загрузить базу знаний: {e}")
        
        # Формируем системный промпт
        system_prompt = "Ты помощник для работы с документами инспекции. Ответ только на русском. ВАЖНО: Пиши КРАТКО, четко и ясно. Только суть, без лишних слов. Используй документацию только если она релевантна запросу."
        
        # Формируем полный промпт с контекстом из базы знаний
        full_prompt = request.prompt
        if knowledge_context:
            full_prompt = f"{knowledge_context}\n\nЗапрос пользователя: {request.prompt}\n\nВАЖНО: Ответ должен быть КРАТКИМ и четким. Только суть."
        elif request.context:
            full_prompt = f"Контекст: {request.context}\n\nЗапрос: {request.prompt}\n\nВАЖНО: Ответ должен быть КРАТКИМ и четким."
        
        # Устанавливаем разумный лимит токенов
        max_tokens = request.max_tokens or 2000  # Дефолтный лимит 2000
        if knowledge_context:
            max_tokens = max(max_tokens, 4000)  # Минимум 4000 токенов при наличии контекста базы знаний
        
        # Генерируем текст
        result = ai_client.generate_text(
            prompt=full_prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=request.temperature or 0.7,
            parent_message_id=request.parent_message_id
        )
        
        # Логирование
        activity = UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="ai_generation",
            description=f"AI text generation: {request.prompt[:50]}..."
        )
        db.add(activity)
        await db.commit()
        
        return AIGenerateResponse(result=result)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI generation error: {str(e)}"
        )


@router.post("/chat", response_model=AIChatResponse)
async def chat_with_ai(
    request: AIChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Only admin and inspector
    if not _user_has_role(current_user, ["admin", "inspector"]):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Сообщение обязательно")
    
    ai_client = await get_ai_client_async(db)
    if not ai_client:
        raise HTTPException(status_code=400, detail="ИИ не настроен")
    
    project_context = await _build_project_context(db)
    user_context = request.context or ""
    knowledge_items = await _search_knowledge_base(db, f"{request.message} {user_context}".strip())
    knowledge_context = _build_knowledge_context(knowledge_items)
    
    mode_hint = "Ответ кратко и по делу."
    if request.response_mode == "detailed":
        mode_hint = "Ответ подробно, с подзаголовками и деталями."
    elif request.response_mode == "conclusions":
        mode_hint = "Ответ только выводами и рекомендациями списком."

    system_prompt = (
        "Ты ассистент InspectorHub. Отвечай строго на русском языке. "
        "Используй ТОЛЬКО данные из PROJECT_SNAPSHOT, DOMAIN_CONTEXT и KNOWLEDGE_BASE. "
        f"Текущая дата (UTC): {datetime.utcnow().date().isoformat()}. "
        "Не используй английские слова и названия полей; если они встречаются, переводи на русский. "
        "Если DOMAIN_CONTEXT или PROJECT_SNAPSHOT содержит релевантные данные, отвечай на их основе и не используй WEB_FALLBACK. "
        "Если данных недостаточно, верни префикс 'WEB_FALLBACK:' и короткий поисковый запрос. "
        "Не изменяй данные. Давай только рекомендации и черновики. "
        f"{mode_hint}"
    )
    
    domain_context, sources = await _build_domain_context(db, request.message)
    data_checks: List[str] = []
    now = datetime.utcnow()
    if _contains_any(request.message, ["просроч", "срок", "дедлайн"]):
        violations_without_deadline = (await db.execute(
            select(func.count()).select_from(Violation).where(
                Violation.status != "resolved",
                Violation.deadline.is_(None)
            )
        )).scalar() or 0
        if violations_without_deadline > 0:
            data_checks.append(f"У {violations_without_deadline} нарушений нет срока устранения.")
    if _contains_any(request.message, ["задач", "поруч", "исполн", "ответствен"]):
        tasks_without_assignee = (await db.execute(
            select(func.count()).select_from(Task).where(Task.assignee_id.is_(None))
        )).scalar() or 0
        if tasks_without_assignee > 0:
            data_checks.append(f"У {tasks_without_assignee} задач не назначен ответственный.")
    full_prompt = (
        f"{project_context}\n\n"
        f"{domain_context}\n\n"
        f"KNOWLEDGE_BASE:\n{knowledge_context}\n\n"
        f"USER_CONTEXT:\n{user_context}\n\n"
        f"USER_MESSAGE:\n{request.message}\n"
    )
    
    try:
        max_tokens = 1200
        if request.response_mode == "detailed":
            max_tokens = 2000
        response_text = ai_client.generate_text(
            prompt=full_prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=0.3
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI chat error: {str(e)}")
    
    web_fallback = False
    web_query = None
    answer = response_text or ""
    if answer.strip().upper().startswith("WEB_FALLBACK:"):
        internal_reply = await _build_internal_fallback(db, request.message)
        if internal_reply:
            answer = internal_reply
            web_fallback = False
            web_query = None
        else:
            web_fallback = True
            web_query = answer.split(":", 1)[1].strip() if ":" in answer else None
            web_results = await _web_search_duckduckgo(web_query or request.message)
            if web_results:
                web_context = "\n".join(
                    [f"- {r['title']}\n  {r['snippet']}\n  {r['link']}" for r in web_results]
                )
                web_prompt = (
                    f"PROJECT_SNAPSHOT:\n{project_context}\n\n"
                    f"WEB_CONTEXT:\n{web_context}\n\n"
                    f"USER_MESSAGE:\n{request.message}\n"
                )
                try:
                    answer = ai_client.generate_text(
                        prompt=web_prompt,
                        system_prompt="Используй WEB_CONTEXT. Отвечай кратко, фактически и по-русски.",
                        max_tokens=1200,
                        temperature=0.3
                    )
                    web_fallback = False
                except Exception:
                    answer = "В проекте недостаточно данных для ответа. Требуется внешний поиск."
            else:
                answer = "В проекте недостаточно данных для ответа. Требуется внешний поиск."

    answer = _normalize_russian_terms(answer)
    if data_checks:
        checks = "\n".join([f"- {c}" for c in data_checks])
        answer = f"{answer}\n\nПроверка данных:\n{checks}\nРекомендуется заполнить отсутствующие поля."
    if sources and "Основано на:" not in answer:
        unique_sources = []
        for s in sources:
            if s not in unique_sources:
                unique_sources.append(s)
        answer = f"{answer}\n\nОсновано на: {', '.join(unique_sources[:12])}"
    
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="ai_chat",
        description=f"AI chat: {request.message[:80]}..."
    )
    db.add(activity)
    await db.commit()
    
    return AIChatResponse(answer=answer, web_fallback=web_fallback, web_query=web_query)

@router.post("/classify_violation", response_model=AIClassifyViolationResponse)
async def classify_violation(
    request: AIClassifyViolationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Классификация нарушения через AI"""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        # Получаем AI клиент
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            raise HTTPException(
                status_code=400,
                detail="AI не настроен. Перейдите в раздел 'Настройки' -> 'Системные настройки' и настройте AI провайдера."
            )
        
        # Получаем контекст из базы знаний
        knowledge_context = ""
        try:
            # Ищем релевантные документы ФНП и ГОСТ
            query = select(KnowledgeBase).where(
                KnowledgeBase.document_type.in_(["fnp461", "gost"])
            ).limit(5)
            
            result = await db.execute(query)
            knowledge_items = result.scalars().all()
            
            if knowledge_items:
                knowledge_context = "\n\n=== БАЗА ЗНАНИЙ ===\n"
                for item in knowledge_items:
                    knowledge_context += f"\n[{item.document_type.upper()}] {item.title}\n"
                    if item.clause_number:
                        knowledge_context += f"Пункт: {item.clause_number}\n"
                    knowledge_context += f"{item.content[:1000]}...\n"
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Не удалось загрузить базу знаний: {e}")
        
        # Анализируем фотографии если есть
        photo_context = ""
        if request.photo_ids:
            try:
                photos_result = await db.execute(
                    select(File).where(File.id.in_(request.photo_ids))
                )
                photos = photos_result.scalars().all()
                
                if photos:
                    photo_context = f"\n\nПрикреплено фотографий: {len(photos)}\n"
                    for photo in photos:
                        photo_context += f"- {photo.original_filename} ({photo.file_type})\n"
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Ошибка загрузки фотографий: {e}")
        
        prompt = f"""Проанализируй описание нарушения и классифицируй его.

ОПИСАНИЕ НАРУШЕНИЯ: {request.text}

{photo_context}

{knowledge_context}

ЗАДАЧА:
1. Определи тип нарушения (краткое название)
2. Определи критичность: low, medium, high, critical
3. Найди соответствующий пункт ГОСТ (если применимо)
4. Оцени уверенность в классификации (0.0-1.0)

ФОРМАТ ОТВЕТА:
ТИП: [краткое название типа нарушения]
КРИТИЧНОСТЬ: [low/medium/high/critical]
ГОСТ: [номер ГОСТ или "не применимо"]
УВЕРЕННОСТЬ: [0.0-1.0]

Требования:
- Тип должен быть кратким и понятным
- Критичность основывай на потенциальной опасности
- ГОСТ указывай только если уверен в соответствии
- Уверенность отражает качество анализа"""
        
        system_prompt = "Ты эксперт по промышленной безопасности и классификации нарушений. Отвечай только на русском. Анализируй нарушения точно и профессионально."
        
        # Генерируем классификацию
        ai_response = ai_client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=1000,
            temperature=0.3  # Низкая температура для более точной классификации
        )
        
        # Парсим ответ
        violation_type = "Неклассифицированное нарушение"
        severity = "medium"
        gost_reference = None
        confidence = 0.5
        
        try:
            lines = ai_response.split('\n')
            for line in lines:
                line = line.strip()
                if line.startswith('ТИП:'):
                    violation_type = line.split(':', 1)[1].strip()
                elif line.startswith('КРИТИЧНОСТЬ:'):
                    severity_text = line.split(':', 1)[1].strip().lower()
                    if severity_text in ["low", "medium", "high", "critical"]:
                        severity = severity_text
                elif line.startswith('ГОСТ:'):
                    gost_text = line.split(':', 1)[1].strip()
                    if gost_text.lower() not in ['не применимо', 'н/д', 'н/а']:
                        gost_reference = gost_text
                elif line.startswith('УВЕРЕННОСТЬ:'):
                    conf_text = line.split(':', 1)[1].strip()
                    try:
                        confidence = float(conf_text)
                        confidence = max(0.0, min(1.0, confidence))  # Ограничиваем 0-1
                    except ValueError:
                        pass
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Ошибка парсинга ответа AI: {e}")
        
        # Логирование
        activity = UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="ai_classification",
            description=f"AI classified violation: {violation_type}"
        )
        db.add(activity)
        await db.commit()
        
        return AIClassifyViolationResponse(
            type=violation_type,
            severity=severity,
            gost_reference=gost_reference,
            confidence=confidence
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI classification error: {str(e)}"
        )

@router.post("/voice_to_text", response_model=AIVoiceToTextResponse)
async def voice_to_text(
    request: AIVoiceToTextRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Распознавание речи в текст (заглушка - требует интеграции с речевыми API)"""
    # Получаем файл
    file_result = await db.execute(
        select(File).where(File.id == request.audio_file_id)
    )
    audio_file = file_result.scalar_one_or_none()
    
    if not audio_file:
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    # Проверяем тип файла
    if not audio_file.mime_type or not audio_file.mime_type.startswith('audio/'):
        raise HTTPException(status_code=400, detail="File is not an audio file")
    
    # ЗАГЛУШКА: В реальной системе здесь была бы интеграция с API распознавания речи
    # Например, Google Speech-to-Text, Azure Speech Services, или Yandex SpeechKit
    
    # Имитируем результат распознавания
    mock_text = "Кран номер один исправен тормоза работают проверка завершена без замечаний"
    
    # Имитируем извлечение пунктов чек-листа
    mock_checklist = {
        "equipment_status": "исправен",
        "brakes_status": "работают", 
        "inspection_result": "без замечаний",
        "extracted_items": [
            {"item": "Состояние крана", "value": "исправен"},
            {"item": "Работа тормозов", "value": "работают"},
            {"item": "Общий результат", "value": "без замечаний"}
        ]
    }
    
    # Логирование
    activity = UserActivity(
        user_id=current_user.id,
        action_type="create",
        entity_type="ai_voice_recognition",
        description=f"AI voice recognition for file: {audio_file.original_filename}"
    )
    db.add(activity)
    await db.commit()
    
    return AIVoiceToTextResponse(
        text=mock_text,
        checklist_items=mock_checklist,
        confidence=0.85
    )

@router.get("/equipment/{equipment_id}/risk", response_model=AIEquipmentRiskResponse)
async def get_equipment_ai_risk(
    equipment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """AI-оценка рисков оборудования"""
    # Получаем оборудование
    eq_result = await db.execute(
        select(Equipment).where(Equipment.id == equipment_id)
    )
    equipment = eq_result.scalar_one_or_none()
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    try:
        # Получаем AI клиент
        ai_client = await get_ai_client_async(db)
        if not ai_client:
            raise HTTPException(
                status_code=400,
                detail="AI не настроен. Перейдите в раздел 'Настройки' -> 'Системные настройки' и настройте AI провайдера."
            )
        
        # Получаем нарушения для оборудования
        violations_result = await db.execute(
            select(Violation).where(Violation.equipment_id == equipment_id)
        )
        violations = violations_result.scalars().all()
        
        # Формируем данные для анализа
        equipment_data = f"""
ОБОРУДОВАНИЕ:
- Тип: {equipment.equipment_type}
- Паспорт: {equipment.passport_number}
- Дата установки: {equipment.installation_date.strftime('%d.%m.%Y') if equipment.installation_date else 'Не указана'}
- Дата ПТО: {equipment.pto_date.strftime('%d.%m.%Y') if equipment.pto_date else 'Не указана'}
- Дата ЧТО: {equipment.cto_date.strftime('%d.%m.%Y') if equipment.cto_date else 'Не указана'}
- Статус: {equipment.status}
- Грузоподъемность: {equipment.load_capacity or 'Не указана'}
- Место установки: {equipment.installation_location or 'Не указано'}

НАРУШЕНИЯ ({len(violations)} шт.):"""
        
        for violation in violations[:10]:  # Берем последние 10 нарушений
            equipment_data += f"""
- {violation.severity.upper()}: {violation.description[:100]}{'...' if len(violation.description) > 100 else ''}
  Статус: {violation.status}, Дата: {violation.created_at.strftime('%d.%m.%Y')}"""
        
        prompt = f"""{equipment_data}

ЗАДАЧА: Проанализируй состояние оборудования и оцени риски.

Учитывай:
1. Возраст оборудования
2. Просрочки ПТО/ЧТО
3. Количество и критичность нарушений
4. Тип оборудования и его назначение
5. Текущий статус

ФОРМАТ ОТВЕТА:
РИСК: [0-100]
ФАКТОРЫ: [список основных факторов риска через запятую]
РЕКОМЕНДАЦИЯ: [конкретные рекомендации по снижению рисков]

Требования:
- Риск от 0 (минимальный) до 100 (критический)
- Факторы должны быть конкретными и обоснованными
- Рекомендации должны быть практичными и выполнимыми"""
        
        system_prompt = "Ты эксперт по промышленной безопасности и оценке рисков подъемных сооружений. Отвечай только на русском. Анализируй риски профессионально и объективно."
        
        # Генерируем оценку
        ai_response = ai_client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=1500,
            temperature=0.4
        )
        
        # Парсим ответ
        risk_score = 50  # По умолчанию средний риск
        factors = ["Требуется дополнительный анализ"]
        recommendation = "Провести детальную проверку оборудования"
        
        try:
            lines = ai_response.split('\n')
            for line in lines:
                line = line.strip()
                if line.startswith('РИСК:'):
                    risk_text = line.split(':', 1)[1].strip()
                    try:
                        risk_score = int(risk_text)
                        risk_score = max(0, min(100, risk_score))
                    except ValueError:
                        pass
                elif line.startswith('ФАКТОРЫ:'):
                    factors_text = line.split(':', 1)[1].strip()
                    if factors_text:
                        factors = [f.strip() for f in factors_text.split(',') if f.strip()]
                elif line.startswith('РЕКОМЕНДАЦИЯ:'):
                    recommendation = line.split(':', 1)[1].strip()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Ошибка парсинга ответа AI: {e}")
        
        # Логирование
        activity = UserActivity(
            user_id=current_user.id,
            action_type="create",
            entity_type="ai_risk_assessment",
            description=f"AI risk assessment for equipment {equipment.passport_number}: {risk_score}%"
        )
        db.add(activity)
        await db.commit()
        
        return AIEquipmentRiskResponse(
            risk_score=risk_score,
            factors=factors,
            recommendation=recommendation
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI risk assessment error: {str(e)}"
        )



