from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from app.services.auth_service import get_current_user, require_roles
from app.services.geo_service import (
    verify_starting_point_arrival,
    haversine_distance_meters,
    calculate_speed_kmh,
    decode_polyline,
    find_nearest_polyline_index
)
from app.services.eta_service import eta_service
from app.schemas.enums import UserRole, TripStatus, AssignmentStatus, NotificationType
from app.schemas.trip import (
    ArrivalCheckRequest,
    ArrivalCheckResponse,
    StartTripResponse,
    LocationSubmission,
    LocationSubmissionResponse,
    EndTripResponse,
    TripResponse,
    LiveLocationResponse,
    LocationHistoryPoint
)
from app.schemas.bus import BusResponse
from app.schemas.route import RouteResponse
from app.repositories.trip_repo import trip_repo
from app.repositories.assignment_repo import assignment_repo
from app.repositories.bus_repo import bus_repo
from app.repositories.route_repo import route_repo
from app.repositories.stop_repo import stop_repo
from app.repositories.user_repo import user_repo
from app.repositories.location_repo import location_repo
from app.repositories.notification_repo import notification_repo
from app.repositories.audit_repo import audit_repo
from app.websocket.connection_manager import ws_manager
from app.core.config import settings

router = APIRouter(prefix="", tags=["Trips & GPS Tracking"])

async def enrich_trip(t: Dict[str, Any]) -> TripResponse:
    bus_doc = await bus_repo.get_by_id(t["bus_id"])
    route_doc = await route_repo.get_by_id(t["route_id"])
    driver_doc = await user_repo.get_by_id(t["driver_id"])
    live = await location_repo.get_live_location(t["_id"])

    live_res = None
    if live:
        now = datetime.now(timezone.utc)
        rec_at = live["recorded_at"]
        if isinstance(rec_at, str):
            rec_at = datetime.fromisoformat(rec_at.replace("Z", "+00:00"))
        if rec_at and rec_at.tzinfo is None:
            rec_at = rec_at.replace(tzinfo=timezone.utc)
        stale_secs = (now - rec_at).total_seconds() if rec_at else 0
        live_res = LiveLocationResponse(
            trip_id=t["_id"],
            bus_id=t["bus_id"],
            bus_number=bus_doc.get("bus_number") if bus_doc else None,
            route_name=route_doc.get("route_name") if route_doc else None,
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

    bus_res = None
    if bus_doc:
        bus_res = BusResponse(
            id=bus_doc["_id"],
            bus_number=bus_doc["bus_number"],
            registration_number=bus_doc.get("registration_number"),
            capacity=bus_doc["capacity"],
            operational_status=bus_doc["operational_status"],
            created_at=bus_doc["created_at"],
            updated_at=bus_doc["updated_at"]
        )

    route_res = None
    if route_doc:
        route_res = RouteResponse(
            id=route_doc["_id"],
            route_name=route_doc["route_name"],
            description=route_doc.get("description"),
            origin_stop_id=route_doc["origin_stop_id"],
            destination_stop_id=route_doc["destination_stop_id"],
            ordered_stop_ids=route_doc["ordered_stop_ids"],
            route_geometry=route_doc["route_geometry"],
            distance_meters=route_doc["distance_meters"],
            estimated_travel_seconds=route_doc["estimated_travel_seconds"],
            route_status=route_doc["route_status"],
            created_at=route_doc["created_at"],
            updated_at=route_doc["updated_at"]
        )

    return TripResponse(
        id=t["_id"],
        assignment_id=t["assignment_id"],
        bus_id=t["bus_id"],
        driver_id=t["driver_id"],
        route_id=t["route_id"],
        trip_status=t["trip_status"],
        arrival_verification_status=t.get("arrival_verification_status", False),
        arrival_verified_at=t.get("arrival_verified_at"),
        started_at=t.get("started_at"),
        ended_at=t.get("ended_at"),
        bus=bus_res,
        route=route_res,
        driver_name=driver_doc.get("name") if driver_doc else "Unknown Driver",
        latest_location=live_res,
        created_at=t["created_at"],
        updated_at=t["updated_at"]
    )

@router.post("/assignments/{assignment_id}/check-arrival", response_model=ArrivalCheckResponse)
async def check_starting_point_arrival(
    assignment_id: str,
    req: ArrivalCheckRequest,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.DRIVER]))
):
    """
    Validates that the driver has physically arrived at the route's starting point (first stop)
    using fresh GPS coordinates from the phone Geolocation API.
    Does NOT offer route navigation; driver navigates independently.
    """
    assignment = await assignment_repo.get_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")

    if assignment["driver_id"] != current_user["_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized assignment.")

    if assignment["assignment_status"] != AssignmentStatus.ACCEPTED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Assignment must be in ACCEPTED state before arrival verification (current: {assignment['assignment_status']})."
        )

    route = await route_repo.get_by_id(assignment["route_id"])
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned route not found.")

    origin_stop = await stop_repo.get_by_id(route["origin_stop_id"])
    if not origin_stop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Origin stop of the route not found.")

    # Validate physical coordinates against starting point
    verified, dist, msg = verify_starting_point_arrival(
        current_lat=req.latitude,
        current_lon=req.longitude,
        start_lat=origin_stop["latitude"],
        start_lon=origin_stop["longitude"],
        accuracy_meters=req.accuracy_meters,
        radius_meters=settings.ARRIVAL_RADIUS_METERS
    )

    # Get or create trip doc and record verification
    trip = await trip_repo.create_or_get_scheduled_trip(
        assignment_id=assignment_id,
        bus_id=assignment["bus_id"],
        driver_id=assignment["driver_id"],
        route_id=assignment["route_id"]
    )

    await trip_repo.record_arrival_verification(
        trip_id=trip["_id"],
        verified=verified,
        location={"latitude": req.latitude, "longitude": req.longitude, "accuracy_meters": req.accuracy_meters}
    )

    if verified:
        await ws_manager.broadcast_event(
            event_type="trip.ready_to_start",
            payload={
                "assignment_id": assignment_id,
                "trip_id": trip["_id"],
                "driver_id": current_user["_id"],
                "distance_to_start_meters": dist
            }
        )

    return ArrivalCheckResponse(
        verified=verified,
        distance_to_start_meters=round(dist, 1),
        threshold_meters=settings.ARRIVAL_RADIUS_METERS,
        verified_at=datetime.now(timezone.utc) if verified else None,
        message=msg
    )

@router.post("/assignments/{assignment_id}/start-trip", response_model=StartTripResponse)
async def start_trip(
    assignment_id: str,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.DRIVER]))
):
    assignment = await assignment_repo.get_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")

    if assignment["driver_id"] != current_user["_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this assignment.")

    if assignment["assignment_status"] != AssignmentStatus.ACCEPTED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment has not been accepted."
        )

    trip = await trip_repo.get_by_assignment_id(assignment_id)
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip record not found. Please verify arrival first.")

    if trip.get("trip_status") == TripStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Trip is already active.")

    if not trip.get("arrival_verification_status"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start trip: Starting-point arrival verification has not passed or was expired."
        )

    # Check verification freshness (< 15 mins)
    verified_at = trip.get("arrival_verified_at")
    if verified_at:
        if isinstance(verified_at, str):
            verified_at = datetime.fromisoformat(verified_at.replace("Z", "+00:00"))
        if verified_at.tzinfo is None:
            verified_at = verified_at.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - verified_at).total_seconds() > 900:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Arrival verification has expired. Please re-verify at the starting point."
            )

    # Atomically start trip
    started_trip = await trip_repo.start_trip(trip["_id"])
    if not started_trip:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not start trip. Check current trip status.")

    route = await route_repo.get_by_id(trip["route_id"])
    bus = await bus_repo.get_by_id(trip["bus_id"])

    # Broadcast trip started to managers and students on the route
    await ws_manager.broadcast_event(
        event_type="trip.started",
        payload={
            "trip_id": started_trip["_id"],
            "assignment_id": assignment_id,
            "route_id": trip["route_id"],
            "route_name": route["route_name"] if route else "",
            "bus_number": bus["bus_number"] if bus else "",
            "driver_name": current_user["name"],
            "started_at": started_trip["started_at"].isoformat()
        },
        route_id=trip["route_id"],
        trip_id=started_trip["_id"]
    )

    await audit_repo.log_action(
        action="start_trip",
        user_id=current_user["_id"],
        entity_type="trip",
        entity_id=started_trip["_id"]
    )

    return StartTripResponse(
        trip_id=started_trip["_id"],
        assignment_id=assignment_id,
        trip_status=TripStatus.ACTIVE,
        started_at=started_trip["started_at"],
        message="Trip successfully started. Live GPS location broadcasting enabled."
    )

# In-memory telemetry anomaly and stoppage tracker per trip
_trip_telemetry_state: Dict[str, Dict[str, Any]] = {}

async def notify_students_telemetry_alert(
    trip_id: str,
    route_id: str,
    bus_number: str,
    route_name: str,
    title: str,
    message: str,
    alert_type: str
):
    """
    Sends smart telemetry predictions (overspeeding, traffic congestion, >3min stoppage)
    directly to students subscribed to or boarding stops on this route.
    """
    try:
        route = await route_repo.get_by_id(route_id)
        ordered_stop_ids = route.get("ordered_stop_ids", []) if route else []

        all_students = await user_repo.list_users(role=UserRole.STUDENT)
        target_students = [
            s for s in all_students
            if not s.get("boarding_stop_id") or s.get("boarding_stop_id") in ordered_stop_ids
        ]

        now = datetime.now(timezone.utc)
        for s in target_students:
            notif = await notification_repo.create_notification(
                recipient_user_id=s["_id"],
                notification_type=NotificationType.GENERAL,
                title=title,
                message=message,
                related_entity_id=trip_id
            )
            await ws_manager.broadcast_event(
                event_type="notification.created",
                payload={
                    "id": notif["_id"],
                    "recipient_user_id": s["_id"],
                    "title": title,
                    "message": message,
                    "notification_type": "general",
                    "related_entity_id": trip_id,
                    "is_read": False,
                    "created_at": now.isoformat()
                },
                recipient_user_id=s["_id"]
            )

        # Broadcast real-time student alert on route room
        await ws_manager.broadcast_event(
            event_type="student.telemetry_alert",
            payload={
                "trip_id": trip_id,
                "route_id": route_id,
                "bus_number": bus_number,
                "route_name": route_name,
                "title": title,
                "message": message,
                "alert_type": alert_type,
                "timestamp": now.isoformat()
            },
            route_id=route_id
        )
    except Exception as e:
        print(f"Error notifying students of telemetry alert: {e}")

@router.post("/trips/{trip_id}/locations", response_model=LocationSubmissionResponse)
async def submit_gps_location(
    trip_id: str,
    loc: LocationSubmission,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.DRIVER]))
):
    """
    Submits real phone GPS observation from the driver's device during an active trip.
    Validates accuracy, coordinate jumps, freshness, and saves both live location and breadcrumb history.
    """
    trip = await trip_repo.get_by_id(trip_id)
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found.")

    if trip["driver_id"] != current_user["_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to submit GPS for this trip.")

    if trip["trip_status"] != TripStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot submit GPS for trip with status '{trip['trip_status']}'.")

    # Verify freshness of client timestamp
    now = datetime.now(timezone.utc)
    rec_time = loc.recorded_at
    if rec_time.tzinfo is None:
        rec_time = rec_time.replace(tzinfo=timezone.utc)
    if (now - rec_time).total_seconds() > settings.GPS_MAX_AGE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GPS observation is too old ({(now - rec_time).total_seconds():.1f}s > max {settings.GPS_MAX_AGE_SECONDS}s)."
        )

    # Validate accuracy
    if loc.accuracy_meters > settings.GPS_MAX_ACCURACY_METERS:
        # We record but flag or reject if extremely poor (>150m)
        if loc.accuracy_meters > 150.0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"GPS accuracy too poor ({loc.accuracy_meters:.1f}m > threshold 150m). Move closer to clear sky."
            )

    # Check speed / coordinate jump against last known live location
    last_loc = await location_repo.get_live_location(trip_id)
    is_anomaly = False
    warning_msg = None
    calculated_speed = 0.0

    if last_loc:
        last_rec = last_loc["recorded_at"]
        if isinstance(last_rec, str):
            last_rec = datetime.fromisoformat(last_rec.replace("Z", "+00:00"))
        if last_rec and last_rec.tzinfo is None:
            last_rec = last_rec.replace(tzinfo=timezone.utc)
        
        calculated_speed = calculate_speed_kmh(
            last_loc["latitude"], last_loc["longitude"], last_rec,
            loc.latitude, loc.longitude, rec_time
        )

        if calculated_speed > settings.MAX_PLAUSIBLE_JUMP_SPEED_KMH:
            is_anomaly = True
            warning_msg = f"Impossible location jump detected ({calculated_speed:.1f} km/h). Observation logged with anomaly flag."
            await audit_repo.log_action(
                action="gps_jump_anomaly",
                user_id=current_user["_id"],
                entity_type="trip",
                entity_id=trip_id,
                details={"speed_kmh": round(calculated_speed, 1), "lat": loc.latitude, "lon": loc.longitude}
            )
        elif calculated_speed > settings.SPEED_ANOMALY_KMH_THRESHOLD:
            is_anomaly = True
            warning_msg = f"Speed warning: {calculated_speed:.1f} km/h exceeds safe college bus threshold ({settings.SPEED_ANOMALY_KMH_THRESHOLD} km/h)."

    effective_speed = loc.speed_kmh if (loc.speed_kmh is not None and loc.speed_kmh >= 0) else round(calculated_speed, 1)

    # 1. Update live location
    await location_repo.upsert_live_location(
        trip_id=trip_id,
        bus_id=trip["bus_id"],
        driver_id=trip["driver_id"],
        latitude=loc.latitude,
        longitude=loc.longitude,
        accuracy_meters=loc.accuracy_meters,
        recorded_at=rec_time,
        sequence_number=loc.sequence_number,
        speed_kmh=effective_speed
    )

    # 2. Record historical breadcrumb
    await location_repo.record_history(
        trip_id=trip_id,
        bus_id=trip["bus_id"],
        driver_id=trip["driver_id"],
        latitude=loc.latitude,
        longitude=loc.longitude,
        accuracy_meters=loc.accuracy_meters,
        recorded_at=rec_time
    )

    # 3. Check approaching stops and broadcast live location
    bus = await bus_repo.get_by_id(trip["bus_id"])
    route = await route_repo.get_by_id(trip["route_id"])
    
    live_payload = {
        "trip_id": trip_id,
        "bus_id": trip["bus_id"],
        "bus_number": bus["bus_number"] if bus else "",
        "route_id": trip["route_id"],
        "route_name": route["route_name"] if route else "",
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "accuracy_meters": loc.accuracy_meters,
        "speed_kmh": effective_speed,
        "recorded_at": rec_time.isoformat(),
        "received_at": now.isoformat(),
        "sequence_number": loc.sequence_number,
        "is_anomaly": is_anomaly
    }

    await ws_manager.broadcast_event(
        event_type="location.updated",
        payload=live_payload,
        route_id=trip["route_id"],
        trip_id=trip_id
    )

    # Check proximity to stops for notifications
    if route and route.get("ordered_stop_ids"):
        stops_data = await stop_repo.get_by_ids(route["ordered_stop_ids"])
        for s in stops_data:
            dist_to_stop = haversine_distance_meters(loc.latitude, loc.longitude, s["latitude"], s["longitude"])
            if dist_to_stop <= settings.APPROACHING_STOP_METERS:
                # Approaching stop event
                await ws_manager.broadcast_event(
                    event_type="bus.approaching_stop",
                    payload={
                        "trip_id": trip_id,
                        "stop_id": s["_id"],
                        "stop_name": s["name"],
                        "distance_meters": round(dist_to_stop, 1)
                    },
                    route_id=trip["route_id"]
                )

    # 4. Smart Telemetry Predictions & Student Notifications
    trip_state = _trip_telemetry_state.setdefault(trip_id, {
        "last_speed_alert_at": None,
        "last_traffic_alert_at": None,
        "stationary_since": None,
        "stationary_alert_sent": False
    })

    bus_num = bus["bus_number"] if bus else ""
    r_name = route["route_name"] if route else ""

    # Check 1: Abnormal Speed (High Speed alert to students)
    if effective_speed > 60.0:
        last_spd = trip_state["last_speed_alert_at"]
        if not last_spd or (now - last_spd).total_seconds() > 180:
            trip_state["last_speed_alert_at"] = now
            await notify_students_telemetry_alert(
                trip_id=trip_id,
                route_id=trip["route_id"],
                bus_number=bus_num,
                route_name=r_name,
                title="⚠️ Bus High Speed Alert",
                message=f"Bus {bus_num} on {r_name} is operating at high speed ({effective_speed:.1f} km/h). Safe driving monitoring active.",
                alert_type="speed_alert"
            )

    # Check 2: Low Speed in Transit (Traffic Congestion Prediction to students)
    elif 0.5 <= effective_speed <= 12.0:
        last_trf = trip_state["last_traffic_alert_at"]
        if not last_trf or (now - last_trf).total_seconds() > 180:
            trip_state["last_traffic_alert_at"] = now
            await notify_students_telemetry_alert(
                trip_id=trip_id,
                route_id=trip["route_id"],
                bus_number=bus_num,
                route_name=r_name,
                title="🚦 Traffic Congestion Delay Alert",
                message=f"Bus {bus_num} on {r_name} is moving slowly ({effective_speed:.1f} km/h) due to road traffic. Please expect 5-10 min delay in arrival.",
                alert_type="traffic_alert"
            )

    # Check 3: Stopped at 0 km/h for more than 3 minutes (Stationary / Extended Stoppage alert)
    if effective_speed < 1.0:
        if trip_state["stationary_since"] is None:
            trip_state["stationary_since"] = rec_time
        else:
            stationary_duration = (rec_time - trip_state["stationary_since"]).total_seconds()
            if stationary_duration >= 180 and not trip_state["stationary_alert_sent"]:
                trip_state["stationary_alert_sent"] = True
                
                # Determine nearest stop on the route
                nearest_desc = "along the route corridor"
                if route and route.get("ordered_stop_ids"):
                    all_stops = await stop_repo.get_by_ids(route["ordered_stop_ids"])
                    if all_stops:
                        closest = min(all_stops, key=lambda s: haversine_distance_meters(loc.latitude, loc.longitude, s["latitude"], s["longitude"]))
                        dist_m = haversine_distance_meters(loc.latitude, loc.longitude, closest["latitude"], closest["longitude"])
                        if dist_m <= 250:
                            nearest_desc = f"at {closest['name']}"
                        else:
                            nearest_desc = f"near {closest['name']} (~{int(dist_m)}m away)"

                await notify_students_telemetry_alert(
                    trip_id=trip_id,
                    route_id=trip["route_id"],
                    bus_number=bus_num,
                    route_name=r_name,
                    title="🛑 Bus Stoppage Notice (>3 mins)",
                    message=f"Bus {bus_num} on {r_name} has been stopped {nearest_desc} for over 3 minutes due to traffic or boarding.",
                    alert_type="stationary_alert"
                )
    else:
        # Bus has resumed movement
        trip_state["stationary_since"] = None
        trip_state["stationary_alert_sent"] = False

    return LocationSubmissionResponse(
        success=True,
        trip_id=trip_id,
        sequence_number=loc.sequence_number,
        received_at=now,
        is_anomaly=is_anomaly,
        warning=warning_msg
    )

@router.post("/trips/{trip_id}/end", response_model=EndTripResponse)
async def end_trip(
    trip_id: str,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.DRIVER]))
):
    _trip_telemetry_state.pop(trip_id, None)
    trip = await trip_repo.get_by_id(trip_id)
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found.")

    if trip["driver_id"] != current_user["_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this trip.")

    if trip["trip_status"] != TripStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot end trip with status '{trip['trip_status']}'.")

    last_loc = await location_repo.get_live_location(trip_id)
    end_location = None
    if last_loc:
        end_location = {"latitude": last_loc["latitude"], "longitude": last_loc["longitude"]}

    # End trip atomically
    ended = await trip_repo.end_trip(trip_id, end_location=end_location)
    
    # Remove from live location collection
    await location_repo.remove_live_location(trip_id)

    # Broadcast trip completed
    bus = await bus_repo.get_by_id(trip["bus_id"])
    route = await route_repo.get_by_id(trip["route_id"])

    await ws_manager.broadcast_event(
        event_type="trip.completed",
        payload={
            "trip_id": trip_id,
            "route_id": trip["route_id"],
            "route_name": route["route_name"] if route else "",
            "bus_number": bus["bus_number"] if bus else "",
            "ended_at": ended["ended_at"].isoformat()
        },
        route_id=trip["route_id"],
        trip_id=trip_id
    )

    await audit_repo.log_action(
        action="end_trip",
        user_id=current_user["_id"],
        entity_type="trip",
        entity_id=trip_id
    )

    return EndTripResponse(
        trip_id=trip_id,
        trip_status=TripStatus.COMPLETED,
        ended_at=ended["ended_at"],
        message="Trip successfully completed. Live location stream closed."
    )

@router.get("/trips/{trip_id}", response_model=TripResponse)
async def get_trip(trip_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    trip = await trip_repo.get_by_id(trip_id)
    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found.")
    return await enrich_trip(trip)

@router.get("/trips/{trip_id}/history", response_model=List[LocationHistoryPoint])
async def get_trip_history(trip_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    history = await location_repo.get_trip_history(trip_id)
    return [
        LocationHistoryPoint(
            latitude=p["latitude"],
            longitude=p["longitude"],
            accuracy_meters=p["accuracy_meters"],
            recorded_at=p["recorded_at"]
        ) for p in history
    ]
