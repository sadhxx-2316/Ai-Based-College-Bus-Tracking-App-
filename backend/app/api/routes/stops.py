from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Dict, Any
from app.services.auth_service import get_current_user, require_roles
from app.schemas.enums import UserRole
from app.schemas.stop import StopCreate, StopUpdate, StopResponse
from app.repositories.stop_repo import stop_repo
from app.repositories.audit_repo import audit_repo

router = APIRouter(prefix="/stops", tags=["Stops"])

@router.get("", response_model=List[StopResponse])
async def list_stops(search: Optional[str] = None):
    stops = await stop_repo.list_stops(search=search)
    return [
        StopResponse(
            id=s["_id"],
            name=s["name"],
            latitude=s["latitude"],
            longitude=s["longitude"],
            place_id=s.get("place_id"),
            address=s.get("address"),
            created_by=s.get("created_by"),
            created_at=s["created_at"],
            updated_at=s["updated_at"]
        ) for s in stops
    ]

@router.post("", response_model=StopResponse, status_code=status.HTTP_201_CREATED)
async def create_stop(
    stop_in: StopCreate,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    stop = await stop_repo.create_stop(
        name=stop_in.name,
        latitude=stop_in.latitude,
        longitude=stop_in.longitude,
        place_id=stop_in.place_id,
        address=stop_in.address,
        created_by=current_user["_id"]
    )
    await audit_repo.log_action(
        action="create_stop",
        user_id=current_user["_id"],
        entity_type="stop",
        entity_id=stop["_id"],
        details={"name": stop["name"], "lat": stop["latitude"], "lon": stop["longitude"]}
    )
    return StopResponse(
        id=stop["_id"],
        name=stop["name"],
        latitude=stop["latitude"],
        longitude=stop["longitude"],
        place_id=stop.get("place_id"),
        address=stop.get("address"),
        created_by=stop.get("created_by"),
        created_at=stop["created_at"],
        updated_at=stop["updated_at"]
    )

@router.put("/{stop_id}", response_model=StopResponse)
async def update_stop(
    stop_id: str,
    stop_in: StopUpdate,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    stop = await stop_repo.get_by_id(stop_id)
    if not stop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stop not found.")

    update_dict = {k: v for k, v in stop_in.model_dump().items() if v is not None}
    updated = await stop_repo.update_stop(stop_id, update_dict)
    return StopResponse(
        id=updated["_id"],
        name=updated["name"],
        latitude=updated["latitude"],
        longitude=updated["longitude"],
        place_id=updated.get("place_id"),
        address=updated.get("address"),
        created_by=updated.get("created_by"),
        created_at=updated["created_at"],
        updated_at=updated["updated_at"]
    )

@router.delete("/{stop_id}", status_code=status.HTTP_200_OK)
async def delete_stop(
    stop_id: str,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    stop = await stop_repo.get_by_id(stop_id)
    if not stop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stop not found.")

    success = await stop_repo.delete_stop(stop_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete stop.")

    await audit_repo.log_action(
        action="delete_stop",
        user_id=current_user["_id"],
        entity_type="stop",
        entity_id=stop_id,
        details={"stop_name": stop.get("name")}
    )
    return {"message": "Stop deleted successfully", "stop_id": stop_id}

