import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from app.services.geo_service import (
    haversine_distance_meters,
    decode_polyline,
    find_nearest_polyline_index
)
from app.core.config import settings
from app.ml.eta_model import ml_eta_service
from app.schemas.eta import ETAResponse

logger = logging.getLogger("college_bus.eta")

class ETAService:
    @staticmethod
    def calculate_eta_for_stop(
        route: Dict[str, Any],
        live_location: Dict[str, Any],
        target_stop: Dict[str, Any],
        all_stops: List[Dict[str, Any]],
        current_speed_kmh: float = 25.0
    ) -> ETAResponse:
        trip_id = live_location.get("trip_id", "")
        stop_id = target_stop.get("id") or target_stop.get("_id")
        stop_name = target_stop.get("name", "Stop")

        # 1. Check GPS Freshness
        now = datetime.now(timezone.utc)
        recorded_at = live_location.get("recorded_at")
        if isinstance(recorded_at, str):
            recorded_at = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        if recorded_at and recorded_at.tzinfo is None:
            recorded_at = recorded_at.replace(tzinfo=timezone.utc)
        
        time_since_last_gps = (now - recorded_at).total_seconds() if recorded_at else 999.0
        is_stale = time_since_last_gps > settings.GPS_STALE_AFTER_SECONDS

        # 2. Decode Route Geometry
        geometry_str = route.get("route_geometry", "")
        if not geometry_str:
            return ETAResponse(
                trip_id=trip_id,
                stop_id=str(stop_id),
                stop_name=stop_name,
                is_available=False,
                accuracy_note="Route geometry unavailable"
            )

        try:
            polyline = decode_polyline(geometry_str)
        except Exception:
            polyline = []

        bus_lat = live_location["latitude"]
        bus_lon = live_location["longitude"]
        stop_lat = target_stop["latitude"]
        stop_lon = target_stop["longitude"]

        if not polyline:
            # Fallback to direct haversine if polyline fails
            direct_dist = haversine_distance_meters(bus_lat, bus_lon, stop_lat, stop_lon)
            approx_speed = max(current_speed_kmh, 20.0) / 3.6  # m/s
            eta_seconds = direct_dist / approx_speed
            return ETAResponse(
                trip_id=trip_id,
                stop_id=str(stop_id),
                stop_name=stop_name,
                eta_seconds=round(eta_seconds, 0),
                eta_minutes=round(eta_seconds / 60.0, 1),
                distance_remaining_meters=round(direct_dist, 1),
                is_stale=is_stale,
                method="approximate_haversine",
                accuracy_note="Calculated via approximate distance; map geometry was unreadable."
            )

        # 3. Locate Bus and Stop along Route Polyline
        bus_idx, bus_dist_to_route = find_nearest_polyline_index(bus_lat, bus_lon, polyline)
        stop_idx, stop_dist_to_route = find_nearest_polyline_index(stop_lat, stop_lon, polyline)

        # 4. Check if Bus has already passed this stop
        # Buffer of 3 indices to prevent false-negative at the stop itself
        if bus_idx > stop_idx + 2:
            return ETAResponse(
                trip_id=trip_id,
                stop_id=str(stop_id),
                stop_name=stop_name,
                is_bus_passed=True,
                is_available=False,
                accuracy_note="The bus has already passed this stop."
            )

        # 5. Measure road-following distance along polyline from bus to stop
        route_distance_meters = 0.0
        for i in range(bus_idx, stop_idx):
            p1 = polyline[i]
            p2 = polyline[i + 1]
            route_distance_meters += haversine_distance_meters(p1[0], p1[1], p2[0], p2[1])

        # Add distance from stop coordinate to polyline
        route_distance_meters += stop_dist_to_route

        # Count intermediate stops between bus and target
        stops_remaining = 0
        for s in all_stops:
            s_lat = s["latitude"]
            s_lon = s["longitude"]
            s_idx, _ = find_nearest_polyline_index(s_lat, s_lon, polyline)
            if bus_idx <= s_idx < stop_idx:
                stops_remaining += 1

        # 6. Check ML prediction first
        hour_of_day = now.hour
        day_of_week = now.weekday()
        ml_seconds = ml_eta_service.predict_eta_seconds(
            remaining_distance_meters=route_distance_meters,
            hour_of_day=hour_of_day,
            day_of_week=day_of_week,
            stops_remaining=stops_remaining,
            current_speed_kmh=current_speed_kmh
        )

        method = "route_baseline"
        if ml_seconds is not None:
            final_seconds = ml_seconds
            method = "ml_model"
        else:
            # Baseline route calculation:
            # Assumes 28 km/h (7.77 m/s) travel speed + 40 seconds dwell time per stop
            effective_speed = max(min(current_speed_kmh, 45.0), 18.0) / 3.6
            travel_time = route_distance_meters / effective_speed
            dwell_time = stops_remaining * 40.0
            final_seconds = travel_time + dwell_time

        estimated_arrival = now + timedelta(seconds=final_seconds)
        accuracy_note = None
        if is_stale:
            accuracy_note = f"Warning: Bus GPS has not been received for {int(time_since_last_gps)}s. ETA may be inaccurate."

        return ETAResponse(
            trip_id=trip_id,
            stop_id=str(stop_id),
            stop_name=stop_name,
            eta_seconds=round(final_seconds, 0),
            eta_minutes=round(final_seconds / 60.0, 1),
            estimated_arrival_time=estimated_arrival,
            distance_remaining_meters=round(route_distance_meters, 1),
            is_bus_passed=False,
            is_stale=is_stale,
            is_available=True,
            method=method,
            accuracy_note=accuracy_note
        )

eta_service = ETAService()
