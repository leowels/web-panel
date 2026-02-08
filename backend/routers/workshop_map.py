from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Dict, Any, List
from datetime import datetime
import os
import uuid

try:
    from backend.models import WorkshopMap, UserActivity, User
    from backend.database import get_db
    from backend.auth import get_current_user, require_permission
except ImportError:
    from ..models import WorkshopMap, UserActivity, User
    from ..database import get_db
    from ..auth import get_current_user, require_permission

router = APIRouter(prefix="/api/workshop-map", tags=["workshop-map"])

UPLOAD_DIR = "uploads/workshop_maps"
os.makedirs(UPLOAD_DIR, exist_ok=True)

DEFAULT_DATA = {
    "elements": [],
    "settings": {
        "gridSize": 50,   # px in 1000x600 viewBox
        "snapToGrid": True,
        "showGrid": True
    }
}

DEFAULT_LAYER_ID = "layer_default"
DEFAULT_FLOOR_ID = "floor_1"


def _new_default_layer() -> Dict[str, Any]:
    return {
        "id": DEFAULT_LAYER_ID,
        "name": "Основной слой",
        "visible": True,
        "locked": False,
    }


def _new_default_floor() -> Dict[str, Any]:
    return {
        "id": DEFAULT_FLOOR_ID,
        "name": "Этаж 1",
        "elements": [],
        "layers": [_new_default_layer()],
        "backgroundPath": None,
    }


def _normalize_settings(settings: Any) -> Dict[str, Any]:
    settings = settings if isinstance(settings, dict) else {}
    return {
        "gridSize": int(settings.get("gridSize", 50)),
        "snapToGrid": bool(settings.get("snapToGrid", True)),
        "showGrid": bool(settings.get("showGrid", True)),
        "gridOpacity": float(settings.get("gridOpacity", 0.35)),
    }


def _normalize_layers(layers: Any) -> List[Dict[str, Any]]:
    if not isinstance(layers, list) or not layers:
        return [_new_default_layer()]
    normalized = []
    for idx, layer in enumerate(layers):
        if not isinstance(layer, dict):
            continue
        layer_id = str(layer.get("id") or f"layer_{idx + 1}")
        normalized.append(
            {
                "id": layer_id,
                "name": str(layer.get("name") or f"Слой {idx + 1}"),
                "visible": bool(layer.get("visible", True)),
                "locked": bool(layer.get("locked", False)),
            }
        )
    return normalized or [_new_default_layer()]


def _normalize_elements(elements: Any, allowed_layer_ids: List[str]) -> List[Dict[str, Any]]:
    if not isinstance(elements, list):
        return []
    result: List[Dict[str, Any]] = []
    default_layer_id = allowed_layer_ids[0] if allowed_layer_ids else DEFAULT_LAYER_ID
    for el in elements:
        if not isinstance(el, dict):
            continue
        layer_id = str(el.get("layerId") or default_layer_id)
        if layer_id not in allowed_layer_ids:
            layer_id = default_layer_id
        normalized = dict(el)
        normalized["layerId"] = layer_id
        result.append(normalized)
    return result


def _normalize_floors(floors: Any, legacy_background_path: Optional[str]) -> List[Dict[str, Any]]:
    if not isinstance(floors, list) or not floors:
        floor = _new_default_floor()
        if legacy_background_path:
            floor["backgroundPath"] = legacy_background_path
        return [floor]

    normalized_floors: List[Dict[str, Any]] = []
    for idx, floor in enumerate(floors):
        if not isinstance(floor, dict):
            continue
        floor_id = str(floor.get("id") or f"floor_{idx + 1}")
        layers = _normalize_layers(floor.get("layers"))
        layer_ids = [layer["id"] for layer in layers]
        elements = _normalize_elements(floor.get("elements"), layer_ids)
        normalized_floors.append(
            {
                "id": floor_id,
                "name": str(floor.get("name") or f"Этаж {idx + 1}"),
                "elements": elements,
                "layers": layers,
                "backgroundPath": floor.get("backgroundPath") or (legacy_background_path if idx == 0 else None),
            }
        )
    return normalized_floors or [_new_default_floor()]


def _normalize_equipment_placements(placements: Any, floor_ids: List[str]) -> Dict[str, Any]:
    if not isinstance(placements, dict):
        return {}
    floor_ids_set = set(floor_ids)
    result: Dict[str, Any] = {}
    for equipment_id, placement in placements.items():
        if not isinstance(placement, dict):
            continue
        floor_id = str(placement.get("floorId") or DEFAULT_FLOOR_ID)
        if floor_id not in floor_ids_set:
            floor_id = floor_ids[0] if floor_ids else DEFAULT_FLOOR_ID
        x = placement.get("x")
        y = placement.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            continue
        result[str(equipment_id)] = {"floorId": floor_id, "x": float(x), "y": float(y)}
    return result


def _normalize_map_data(data: Any, legacy_background_path: Optional[str]) -> Dict[str, Any]:
    data = data if isinstance(data, dict) else {}

    # Legacy shape: { elements, settings }
    if "floors" not in data and "elements" in data:
        floor = _new_default_floor()
        if legacy_background_path:
            floor["backgroundPath"] = legacy_background_path
        floor["elements"] = _normalize_elements(data.get("elements"), [DEFAULT_LAYER_ID])
        normalized = {
            "version": 2,
            "settings": _normalize_settings(data.get("settings")),
            "floors": [floor],
            "activeFloorId": DEFAULT_FLOOR_ID,
            "equipmentPlacements": {},
        }
        return normalized

    floors = _normalize_floors(data.get("floors"), legacy_background_path)
    floor_ids = [floor["id"] for floor in floors]
    active_floor_id = str(data.get("activeFloorId") or floor_ids[0])
    if active_floor_id not in floor_ids:
        active_floor_id = floor_ids[0]
    return {
        "version": 2,
        "settings": _normalize_settings(data.get("settings")),
        "floors": floors,
        "activeFloorId": active_floor_id,
        "equipmentPlacements": _normalize_equipment_placements(data.get("equipmentPlacements"), floor_ids),
    }


def _extract_active_background_path(data: Dict[str, Any]) -> Optional[str]:
    active_floor_id = data.get("activeFloorId")
    floors = data.get("floors") or []
    if not isinstance(floors, list):
        return None
    for floor in floors:
        if isinstance(floor, dict) and floor.get("id") == active_floor_id:
            return floor.get("backgroundPath")
    if floors and isinstance(floors[0], dict):
        return floors[0].get("backgroundPath")
    return None


@router.get("")
async def get_workshop_map(
    workshop: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_permission(current_user, "equipment:read", db)
    
    workshop_key = (workshop or "default").strip()
    result = await db.execute(select(WorkshopMap).where(WorkshopMap.workshop == workshop_key))
    record = result.scalar_one_or_none()
    
    if not record:
        normalized_default = _normalize_map_data(DEFAULT_DATA, None)
        return {
            "workshop": workshop_key,
            "data": normalized_default,
            "background_path": None,
            "updated_at": None
        }

    normalized = _normalize_map_data(record.data, record.background_path)
    return {
        "workshop": record.workshop,
        "data": normalized,
        "background_path": _extract_active_background_path(normalized) or record.background_path,
        "updated_at": record.updated_at
    }


@router.put("")
async def upsert_workshop_map(
    payload: Dict[str, Any],
    workshop: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_permission(current_user, "equipment:update", db)
    
    workshop_key = (workshop or "default").strip()
    data = payload.get("data")
    background_path = payload.get("background_path")

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="data must be an object")

    normalized = _normalize_map_data(data, background_path)
    extracted_background = _extract_active_background_path(normalized) or background_path

    result = await db.execute(select(WorkshopMap).where(WorkshopMap.workshop == workshop_key))
    record = result.scalar_one_or_none()
    
    if not record:
        record = WorkshopMap(
            workshop=workshop_key,
            data=normalized,
            background_path=extracted_background,
            updated_by=current_user.id
        )
        db.add(record)
    else:
        record.data = normalized
        record.background_path = extracted_background
        record.updated_by = current_user.id
        record.updated_at = datetime.utcnow()
    
    activity = UserActivity(
        user_id=current_user.id,
        action_type="update",
        entity_type="workshop_map",
        description=f"Updated workshop map: {workshop_key}"
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(record)
    
    return {
        "workshop": record.workshop,
        "data": _normalize_map_data(record.data, record.background_path),
        "background_path": record.background_path,
        "updated_at": record.updated_at
    }


@router.post("/upload")
async def upload_workshop_map_background(
    file: UploadFile = File(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await require_permission(current_user, "equipment:update", db)
    
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"]:
        raise HTTPException(status_code=400, detail="Unsupported image format")
    
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)
    
    return {"path": f"/api/workshop-map/background/{filename}"}


@router.get("/background/{filename}")
async def get_workshop_map_background(
    filename: str,
):
    safe_name = os.path.basename(filename)
    path = os.path.join(UPLOAD_DIR, safe_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Background not found")
    return FileResponse(path)
