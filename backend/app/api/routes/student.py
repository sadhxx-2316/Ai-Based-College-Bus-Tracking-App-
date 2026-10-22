from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from app.services.auth_service import get_current_user
from app.services.eta_service import eta_service
from app.schemas.route import RouteResponse
from app.schemas.trip import TripResponse, LiveLocationResponse
from app.schemas.stop import StopResponse
from app.schemas.eta import ETAResponse
from app.schemas.student import StudentFleetBus
from app.repositories.route_repo import route_repo
from app.repositories.stop_repo import stop_repo
from app.repositories.trip_repo import trip_repo
from app.repositories.bus_repo import bus_repo
from app.repositories.assignment_repo import assignment_repo
from app.repositories.user_repo import user_repo
from app.repositories.location_repo import location_repo
from app.api.routes.routes import enrich_route
from app.api.routes.trips import enrich_trip
from app.core.config import settings

router = APIRouter(prefix="", tags=["Student Services"])

@router.get("/student/fleet", response_model=List[StudentFleetBus])
async def list_student_fleet(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns all college buses with their assigned route, scheduled timing, operational/trip status,
    driver info, ordered stops, and real-time live GPS location if currently active.
    """
    all_buses = await bus_repo.list_buses()
    all_routes = await route_repo.list_routes()
    routes_by_id = {r["_id"]: r for r in all_routes}
    stops_cache = {}

    async def get_stops_for_ids(ids: List[str]):
        missing = [i for i in ids if i not in stops_cache]
        if missing:
            fetched = await stop_repo.get_by_ids(missing)
            for s in fetched:
                stops_cache[s["_id"]] = StopResponse(
                    id=s["_id"],
                    name=s["name"],
                    latitude=s["latitude"],
                    longitude=s["longitude"],
                    place_id=s.get("place_id"),
                    address=s.get("address"),
                    created_by=s.get("created_by"),
                    created_at=s["created_at"],
                    updated_at=s["updated_at"]
                )
        return [stops_cache[i] for i in ids if i in stops_cache]

    fleet: List[StudentFleetBus] = []

    for bus in all_buses:
        bus_id = bus["_id"]
        active_trip = await trip_repo.get_active_trip_by_bus(bus_id)
        target_route_id = None
        driver_name = None
        scheduled_departure = "07:30 AM"
        service_date = None
        assignment_id = None
        trip_id = None
        trip_status = "idle"
        live_res = None

        if active_trip:
            trip_id = active_trip["_id"]
            trip_status = "active"
            target_route_id = active_trip["route_id"]
            assignment_id = active_trip.get("assignment_id")
            if active_trip.get("driver_id"):
                driver_doc = await user_repo.get_by_id(active_trip["driver_id"])
                if driver_doc:
                    driver_name = driver_doc.get("name")
            if assignment_id:
                asg = await assignment_repo.get_by_id(assignment_id)
                if asg:
                    scheduled_departure = asg.get("scheduled_departure") or "07:30 AM"
                    service_date = asg.get("service_date")
            
            live = await location_repo.get_live_location(trip_id)
            if live:
                now = datetime.now(timezone.utc)
                rec_at = live["recorded_at"]
                if isinstance(rec_at, str):
                    rec_at = datetime.fromisoformat(rec_at.replace("Z", "+00:00"))
                if rec_at and rec_at.tzinfo is None:
                    rec_at = rec_at.replace(tzinfo=timezone.utc)
                stale_secs = (now - rec_at).total_seconds() if rec_at else 0
                live_res = LiveLocationResponse(
                    trip_id=trip_id,
                    bus_id=bus_id,
                    bus_number=bus.get("bus_number"),
                    route_name=routes_by_id.get(target_route_id, {}).get("route_name"),
                    latitude=live["latitude"],
                    longitude=live["longitude"],
                    accuracy_meters=live["accuracy_meters"],
                    speed_kmh=round(live.get("speed_kmh", 0.0), 1),
                    recorded_at=live["recorded_at"],
                    received_at=live["received_at"],
                    sequence_number=live.get("sequence_number", 0),
                    is_stale=stale_secs > settings.GPS_STALE_AFTER_SECONDS,
                    stale_seconds=round(stale_secs, 1)
                )
        else:
            assignments = await assignment_repo.list_assignments(bus_id=bus_id)
            valid_asg = next((a for a in assignments if a.get("assignment_status") in ["accepted", "pending"]), None)
            if valid_asg:
                assignment_id = valid_asg["_id"]
                target_route_id = valid_asg["route_id"]
                scheduled_departure = valid_asg.get("scheduled_departure") or "07:30 AM"
                service_date = valid_asg.get("service_date")
                trip_status = "scheduled"
                if valid_asg.get("driver_id"):
                    driver_doc = await user_repo.get_by_id(valid_asg["driver_id"])
                    if driver_doc:
                        driver_name = driver_doc.get("name")
                sch_trip = await trip_repo.get_by_assignment_id(assignment_id)
                if sch_trip:
                    trip_id = sch_trip["_id"]
            else:
                if all_routes:
                    idx = abs(hash(bus_id)) % len(all_routes)
                    target_route_id = all_routes[idx]["_id"]
                    scheduled_departure = "08:00 AM"
                    trip_status = "scheduled"

        route_doc = routes_by_id.get(target_route_id) if target_route_id else None
        route_stops = []
        if route_doc and route_doc.get("ordered_stop_ids"):
            route_stops = await get_stops_for_ids(route_doc["ordered_stop_ids"])

        fleet.append(
            StudentFleetBus(
                bus_id=bus_id,
                bus_number=bus.get("bus_number", "Bus"),
                registration_number=bus.get("registration_number"),
                capacity=bus.get("capacity", 50),
                operational_status=bus.get("operational_status", "active"),
                route_id=target_route_id,
                route_name=route_doc.get("route_name") if route_doc else "College Route",
                route_description=route_doc.get("description") if route_doc else None,
                scheduled_departure=scheduled_departure,
                service_date=service_date,
                assignment_id=assignment_id,
                driver_name=driver_name or "College Senior Driver",
                trip_id=trip_id,
                trip_status=trip_status,
                stops=route_stops,
                route_geometry=route_doc.get("route_geometry") if route_doc else None,
                distance_meters=route_doc.get("distance_meters") if route_doc else None,
                estimated_travel_seconds=route_doc.get("estimated_travel_seconds") if route_doc else None,
                latest_location=live_res
            )
        )

    return fleet

@router.get("/student/routes", response_model=List[RouteResponse])
async def list_student_routes(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns active routes available for student viewing.
    """
    routes = await route_repo.list_routes(status="active")
    return [await enrich_route(r) for r in routes]

@router.get("/student/routes/{route_id}", response_model=RouteResponse)
async def get_student_route_detail(route_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    route = await route_repo.get_by_id(route_id)
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")
    return await enrich_route(route)

@router.get("/student/routes/{route_id}/trips", response_model=List[TripResponse])
async def get_student_route_trips(route_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns trips operating on this route (active and scheduled), with real-time GPS locations.
    """
    trips = await trip_repo.list_trips(route_id=route_id, limit=10)
    return [await enrich_trip(t) for t in trips]

@router.get("/trips/{trip_id}/eta", response_model=ETAResponse)
async def get_trip_eta_to_stop(
    trip_id: str,
    stop_id: str = Query(..., description="ID of the stop to calculate ETA towards"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Calculates accurate route-following travel ETA from the active bus's latest accepted GPS coordinate
    to the designated stop. Does NOT use hardcoded fake speed or straight line.
    """
    trip = await trip_repo.get_by_id(trip_id)
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found.")

    if trip["trip_status"] != "active":
        return ETAResponse(
            trip_id=trip_id,
            stop_id=stop_id,
            stop_name="",
            is_available=False,
            accuracy_note=f"Trip is currently {trip['trip_status']}. Live ETA is only available during active trips."
        )

    live_loc = await location_repo.get_live_location(trip_id)
    if not live_loc:
        return ETAResponse(
            trip_id=trip_id,
            stop_id=stop_id,
            stop_name="",
            is_available=False,
            accuracy_note="Waiting for first GPS update from driver phone."
        )

    route = await route_repo.get_by_id(trip["route_id"])
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")

    target_stop = await stop_repo.get_by_id(stop_id)
    if not target_stop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target stop not found.")

    all_stops = await stop_repo.get_by_ids(route.get("ordered_stop_ids", []))

    eta_res = eta_service.calculate_eta_for_stop(
        route=route,
        live_location=live_loc,
        target_stop=target_stop,
        all_stops=all_stops
    )
    return eta_res
