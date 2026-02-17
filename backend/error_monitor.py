import logging
from typing import Any, Optional

try:
    from backend.database import async_session
    from backend.models import ErrorEvent
except ImportError:
    from .database import async_session
    from .models import ErrorEvent

logger = logging.getLogger(__name__)


def _normalize_details(details: Optional[Any]) -> Optional[Any]:
    if details is None:
        return None
    if isinstance(details, (dict, list)):
        return details
    return {"raw": str(details)}


async def capture_error_event(
    *,
    code: str,
    message: str,
    trace_id: str,
    path: Optional[str],
    method: Optional[str],
    status_code: int,
    retryable: bool,
    details: Optional[Any] = None,
) -> None:
    """
    Best-effort запись ошибки в БД.
    Никакие исключения отсюда не должны ломать основной request-flow.
    """
    try:
        async with async_session() as db:
            event = ErrorEvent(
                code=(code or "UNKNOWN")[:64],
                message=message or "Unknown error",
                trace_id=(trace_id or "")[:36],
                path=(path or "")[:255] if path else None,
                method=(method or "")[:16] if method else None,
                status_code=int(status_code),
                retryable=bool(retryable),
                details=_normalize_details(details),
            )
            db.add(event)
            await db.commit()
    except Exception as exc:
        logger.warning("Failed to persist error event: %s", str(exc))
