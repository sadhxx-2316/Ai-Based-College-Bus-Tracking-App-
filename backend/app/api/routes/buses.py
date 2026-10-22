from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Dict, Any
from app.services.auth_service import get_current_user, require_roles
from app.schemas.enums import UserRole, BusStatus
from app.schemas.bus import BusCreate, BusUpdate, BusStatusUpdate, BusResponse
from app.schemas.trip import LiveLocationResponse
from app.repositories.bus_repo import bus_repo
from app.repositories.trip_repo import trip_repo
from app.repositories.location_repo import location_repo
from app.repositories.audit_repo import audit_repo
from app.core.config import settings
from datetime import datetime, timezone

router = APIRouter(prefix="/buses", tags=["Buses"])

@router.get("", response_model=List[BusResponse])
async def list_buses(
    status: Optional[BusStatus] = None,
    search: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    buses = await bus_repo.list_buses(status=status, search=search)
    return [
        BusResponse(
            id=b["_id"],
            bus_number=b["bus_number"],
            registration_number=b.get("registration_number"),
            capacity=b["capacity"],
            operational_status=b["operational_status"],
            created_at=b["created_at"],
            updated_at=b["updated_at"]
        ) for b in buses
    ]

@router.post("", response_model=BusResponse, status_code=status.HTTP_201_CREATED)
async def create_bus(
    bus_in: BusCreate,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    existing = await bus_repo.get_by_bus_number(bus_in.bus_number)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bus with number '{bus_in.bus_number}' already exists."
        )

    bus = await bus_repo.create_bus(
        bus_number=bus_in.bus_number,
        capacity=bus_in.capacity,
        registration_number=bus_in.registration_number,
        operational_status=bus_in.operational_status
    )

    await audit_repo.log_action(
        action="create_bus",
        user_id=current_user["_id"],
        entity_type="bus",
        entity_id=bus["_id"],
        details={"bus_number": bus["bus_number"], "capacity": bus["capacity"]}
    )

    return BusResponse(
        id=bus["_id"],
        bus_number=bus["bus_number"],
        registration_number=bus.get("registration_number"),
        capacity=bus["capacity"],
        operational_status=bus["operational_status"],
        created_at=bus["created_at"],
        updated_at=bus["updated_at"]
    )

@router.get("/{bus_id}", response_model=BusResponse)
async def get_bus(bus_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    bus = await bus_repo.get_by_id(bus_id)
    if not bus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bus not found.")
    return BusResponse(
        id=bus["_id"],
        bus_number=bus["bus_number"],
        registration_number=bus.get("registration_number"),
        capacity=bus["capacity"],
        operational_status=bus["operational_status"],
        created_at=bus["created_at"],
        updated_at=bus["updated_at"]
    )

@router.put("/{bus_id}", response_model=BusResponse)
async def update_bus(
    bus_id: str,
    bus_in: BusUpdate,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    bus = await bus_repo.get_by_id(bus_id)
    if not bus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bus not found.")

    if bus_in.bus_number and bus_in.bus_number.strip().upper() != bus["bus_number"]:
        existing = await bus_repo.get_by_bus_number(bus_in.bus_number)
        if existing and existing["_id"] != bus_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bus with number '{bus_in.bus_number}' already exists."
            )

    update_dict = {k: v for k, v in bus_in.model_dump().items() if v is not None}
    updated = await bus_repo.update_bus(bus_id, update_dict)

    await audit_repo.log_action(
        action="update_bus",
        user_id=current_user["_id"],
        entity_type="bus",
        entity_id=bus_id,
        details=update_dict
    )

    return BusResponse(
        id=updated["_id"],
        bus_number=updated["bus_number"],
        registration_number=updated.get("registration_number"),
        capacity=updated["capacity"],
        operational_status=updated["operational_status"],
        created_at=updated["created_at"],
        updated_at=updated["updated_at"]
    )

@router.patch("/{bus_id}/status", response_model=BusResponse)
async def update_bus_status(
    bus_id: str,
    status_in: BusStatusUpdate,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    bus = await bus_repo.get_by_id(bus_id)
    if not bus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bus not found.")

    if status_in.operational_status != BusStatus.ACTIVE:
        active_trip = await trip_repo.get_active_trip_by_bus(bus_id)
        if active_trip:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate bus while it is currently operating an active trip."
            )

    updated = await bus_repo.update_bus(bus_id, {"operational_status": status_in.operational_status})
    return BusResponse(
        id=updated["_id"],
        bus_number=updated["bus_number"],
        registration_number=updated.get("registration_number"),
        capacity=updated["capacity"],
        operational_status=updated["operational_status"],
        created_at=updated["created_at"],
        updated_at=updated["updated_at"]
    )

@router.get("/{bus_id}/live-location", response_model=Optional[LiveLocationResponse])
async def get_bus_live_location(bus_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    bus = await bus_repo.get_by_id(bus_id)
    if not bus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bus not found.")

    live = await location_repo.get_live_location_by_bus(bus_id)
    if not live:
        return None

    now = datetime.now(timezone.utc)
    recorded_at = live["recorded_at"]
    if isinstance(recorded_at, str):
        recorded_at = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
    stale_secs = (now - recorded_at).total_seconds()
    is_stale = stale_secs > settings.GPS_STALE_AFTER_SECONDS

    return LiveLocationResponse(
        trip_id=live["trip_id"],
        bus_id=live["bus_id"],
        bus_number=bus.get("bus_number"),
        latitude=live["latitude"],
        longitude=live["longitude"],
        accuracy_meters=live["accuracy_meters"],
        recorded_at=live["recorded_at"],
        received_at=live["received_at"],
        sequence_number=live.get("sequence_number", 0),
        is_stale=is_stale,
        stale_seconds=round(stale_secs, 1)
    )
