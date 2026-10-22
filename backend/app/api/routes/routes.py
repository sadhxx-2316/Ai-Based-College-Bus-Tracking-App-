from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
from app.services.auth_service import get_current_user, require_roles
from app.services.geo_service import compute_road_route
from app.schemas.enums import UserRole
from app.schemas.route import RouteCreate, RouteUpdate, RouteResponse, RoutePreviewRequest, RoutePreviewResponse
from app.schemas.stop import StopResponse
from app.repositories.route_repo import route_repo
from app.repositories.stop_repo import stop_repo
from app.repositories.audit_repo import audit_repo

router = APIRouter(prefix="/routes", tags=["Routes"])

async def enrich_route(r: Dict[str, Any]) -> RouteResponse:
    stops_data = await stop_repo.get_by_ids(r.get("ordered_stop_ids", []))
    stop_objs = [
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
        ) for s in stops_data
    ]
    return RouteResponse(
        id=r["_id"],
        route_name=r["route_name"],
        description=r.get("description"),
        origin_stop_id=r["origin_stop_id"],
        destination_stop_id=r["destination_stop_id"],
        ordered_stop_ids=r["ordered_stop_ids"],
        stops=stop_objs,
        route_geometry=r["route_geometry"],
        distance_meters=r["distance_meters"],
        estimated_travel_seconds=r["estimated_travel_seconds"],
        route_status=r["route_status"],
        created_by=r.get("created_by"),
        created_at=r["created_at"],
        updated_at=r["updated_at"]
    )

@router.get("", response_model=List[RouteResponse])
async def list_routes(status: Optional[str] = "active", current_user: Dict[str, Any] = Depends(get_current_user)):
    routes = await route_repo.list_routes(status=status)
    return [await enrich_route(r) for r in routes]

@router.post("/preview", response_model=RoutePreviewResponse)
async def preview_route(
    req: RoutePreviewRequest,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    if len(req.ordered_stop_ids) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Route preview requires at least 2 stops (origin and destination)."
        )

    stops_data = await stop_repo.get_by_ids(req.ordered_stop_ids)
    if len(stops_data) != len(req.ordered_stop_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more specified stop IDs do not exist."
        )

    try:
        route_calc = await compute_road_route(stops_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Route calculation failed: {str(e)}"
        )

    stop_objs = [
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
        ) for s in stops_data
    ]

    return RoutePreviewResponse(
        route_geometry=route_calc["route_geometry"],
        distance_meters=route_calc["distance_meters"],
        estimated_travel_seconds=route_calc["estimated_travel_seconds"],
        stops=stop_objs
    )

@router.post("", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
async def create_route(
    route_in: RouteCreate,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    if len(route_in.ordered_stop_ids) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A route must have at least 2 stops (origin and destination)."
        )

    stops_data = await stop_repo.get_by_ids(route_in.ordered_stop_ids)
    if len(stops_data) != len(route_in.ordered_stop_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more stops in the route could not be found."
        )

    # Compute or verify geometry
    if not route_in.route_geometry:
        route_calc = await compute_road_route(stops_data)
        geometry = route_calc["route_geometry"]
        distance = route_calc["distance_meters"]
        travel_sec = route_calc["estimated_travel_seconds"]
    else:
        geometry = route_in.route_geometry
        distance = route_in.distance_meters or 0.0
        travel_sec = route_in.estimated_travel_seconds or 0.0

    origin_id = route_in.ordered_stop_ids[0]
    dest_id = route_in.ordered_stop_ids[-1]

    route = await route_repo.create_route(
        route_name=route_in.route_name,
        origin_stop_id=origin_id,
        destination_stop_id=dest_id,
        ordered_stop_ids=route_in.ordered_stop_ids,
        route_geometry=geometry,
        distance_meters=distance,
        estimated_travel_seconds=travel_sec,
        description=route_in.description,
        created_by=current_user["_id"]
    )

    await audit_repo.log_action(
        action="create_route",
        user_id=current_user["_id"],
        entity_type="route",
        entity_id=route["_id"],
        details={"name": route["route_name"], "stops": len(route["ordered_stop_ids"])}
    )

    return await enrich_route(route)

@router.get("/{route_id}", response_model=RouteResponse)
async def get_route(route_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    route = await route_repo.get_by_id(route_id)
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")
    return await enrich_route(route)

@router.put("/{route_id}", response_model=RouteResponse)
async def update_route(
    route_id: str,
    route_in: RouteUpdate,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    route = await route_repo.get_by_id(route_id)
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")

    update_dict = {k: v for k, v in route_in.model_dump().items() if v is not None}
    
    # If stops changed, regenerate geometry and recalculate distance
    if "ordered_stop_ids" in update_dict and update_dict["ordered_stop_ids"]:
        stop_ids = update_dict["ordered_stop_ids"]
        stops_data = await stop_repo.get_by_ids(stop_ids)
        route_calc = await compute_road_route(stops_data)
        update_dict["origin_stop_id"] = stop_ids[0]
        update_dict["destination_stop_id"] = stop_ids[-1]
        update_dict["route_geometry"] = route_calc["route_geometry"]
        update_dict["distance_meters"] = route_calc["distance_meters"]
        update_dict["estimated_travel_seconds"] = route_calc["estimated_travel_seconds"]

    updated = await route_repo.update_route(route_id, update_dict)
    return await enrich_route(updated)

@router.delete("/{route_id}", status_code=status.HTTP_200_OK)
async def delete_route(
    route_id: str,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    route = await route_repo.get_by_id(route_id)
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")

    success = await route_repo.delete_route(route_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete route.")

    await audit_repo.log_action(
        action="delete_route",
        user_id=current_user["_id"],
        entity_type="route",
        entity_id=route_id,
        details={"route_name": route.get("route_name")}
    )
    return {"message": "Route deleted successfully", "route_id": route_id}

