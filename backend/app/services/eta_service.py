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

        bus_lat = live_location["latitude"]
        bus_lon = live_location["longitude"]
        stop_lat = target_stop["latitude"]
        stop_lon = target_stop["longitude"]

        # Direct haversine distance from bus to target stop (meters)
        direct_dist = haversine_distance_meters(bus_lat, bus_lon, stop_lat, stop_lon)

        # 2. Decode Route Geometry if available
        geometry_str = route.get("route_geometry", "")
        polyline = []
        if geometry_str:
            try:
                polyline = decode_polyline(geometry_str)
            except Exception:
                polyline = []

        route_distance_meters = 0.0
        stops_remaining = 0
        use_polyline = False

        if polyline:
            bus_idx, bus_dist_to_route = find_nearest_polyline_index(bus_lat, bus_lon, polyline)
            stop_idx, stop_dist_to_route = find_nearest_polyline_index(stop_lat, stop_lon, polyline)

            # Check if bus is before or at the stop along the polyline
            if bus_idx <= stop_idx + 2:
                for i in range(bus_idx, stop_idx):
                    p1 = polyline[i]
                    p2 = polyline[i + 1]
                    route_distance_meters += haversine_distance_meters(p1[0], p1[1], p2[0], p2[1])
                route_distance_meters += stop_dist_to_route
                use_polyline = True

                for s in all_stops:
                    s_lat = s["latitude"]
                    s_lon = s["longitude"]
                    s_idx, _ = find_nearest_polyline_index(s_lat, s_lon, polyline)
                    if bus_idx <= s_idx < stop_idx:
                        stops_remaining += 1

        # 3. Fallback to Distance Formula if polyline not available or bus passed index
        if not use_polyline or route_distance_meters <= 0.0:
            # Apply standard urban winding factor (1.25x direct distance)
            route_distance_meters = direct_dist * 1.25
            ordered_ids = route.get("ordered_stop_ids", [])
            if ordered_ids and str(stop_id) in ordered_ids:
                try:
                    idx = ordered_ids.index(str(stop_id))
                    stops_remaining = max(0, min(idx, 4))
                except ValueError:
                    stops_remaining = 0

        # 4. Effective Speed (incorporate live speed or use sensible urban bus transit baseline 25-28 km/h)
        speed = float(live_location.get("speed_kmh") or current_speed_kmh or 0.0)
        if speed > 5.0:
            effective_speed_kmh = min(speed, 65.0)
        else:
            # Bus temporarily stationary or at stop; use typical college route speed
            effective_speed_kmh = 25.0

        effective_speed_ms = (effective_speed_kmh * 1000.0) / 3600.0

        # 5. Travel Time Calculation via Distance Formula
        travel_seconds = route_distance_meters / effective_speed_ms
        dwell_seconds = stops_remaining * 35.0  # ~35 seconds passenger boarding per stop
        final_seconds = travel_seconds + dwell_seconds
        eta_minutes = max(1.0, round(final_seconds / 60.0, 1))

        estimated_arrival = now + timedelta(seconds=final_seconds)
        accuracy_note = None
        if is_stale:
            accuracy_note = f"Warning: Bus GPS has not been received for {int(time_since_last_gps)}s. ETA may be delayed."
        elif direct_dist < 60.0:
            accuracy_note = "Bus is arriving at your stop now."

        return ETAResponse(
            trip_id=trip_id,
            stop_id=str(stop_id),
            stop_name=stop_name,
            eta_seconds=round(final_seconds, 0),
            eta_minutes=eta_minutes,
            estimated_arrival_time=estimated_arrival,
            distance_remaining_meters=round(route_distance_meters, 1),
            is_bus_passed=False,
            is_stale=is_stale,
            is_available=True,
            method="distance_formula" if not use_polyline else "route_distance_model",
            accuracy_note=accuracy_note
        )

eta_service = ETAService()
