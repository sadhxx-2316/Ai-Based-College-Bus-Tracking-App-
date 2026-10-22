import math
import logging
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime, timezone
import httpx
from app.core.config import settings

logger = logging.getLogger("college_bus.geo")

EARTH_RADIUS_METERS = 6371000.0

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates great-circle distance between two points on the Earth surface in meters.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return EARTH_RADIUS_METERS * c

def decode_polyline(polyline_str: str) -> List[Tuple[float, float]]:
    """
    Decodes a Google encoded polyline string into a list of (lat, lon) tuples.
    """
    index = 0
    lat = 0
    lng = 0
    coordinates: List[Tuple[float, float]] = []
    length = len(polyline_str)

    while index < length:
        # Latitude
        shift = 0
        result = 0
        while True:
            byte = ord(polyline_str[index]) - 63
            index += 1
            result |= (byte & 0x1f) << shift
            shift += 5
            if byte < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        # Longitude
        shift = 0
        result = 0
        while True:
            byte = ord(polyline_str[index]) - 63
            index += 1
            result |= (byte & 0x1f) << shift
            shift += 5
            if byte < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coordinates.append((lat / 1e5, lng / 1e5))

    return coordinates

def encode_polyline(coordinates: List[Tuple[float, float]]) -> str:
    """
    Encodes a list of (lat, lon) tuples into a Google encoded polyline string.
    """
    result = []
    prev_lat = 0
    prev_lng = 0

    for lat, lng in coordinates:
        late5 = int(round(lat * 1e5))
        lnge5 = int(round(lng * 1e5))

        dlat = late5 - prev_lat
        dlng = lnge5 - prev_lng

        prev_lat = late5
        prev_lng = lnge5

        for val in (dlat, dlng):
            val = ~(val << 1) if val < 0 else (val << 1)
            while val >= 0x20:
                result.append(chr((0x20 | (val & 0x1f)) + 63))
                val >>= 5
            result.append(chr(val + 63))

    return "".join(result)

async def compute_road_route(stops: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes road-following route geometry and distance using Google Routes API if available,
    or falls back to high-resolution interpolated road geometry.
    """
    if len(stops) < 2:
        raise ValueError("At least 2 stops are required to compute a route.")

    # 1. Try Google Routes API if server key is configured
    if settings.GOOGLE_MAPS_SERVER_KEY:
        try:
            origin = stops[0]
            destination = stops[-1]
            intermediates = stops[1:-1]

            request_body = {
                "origin": {
                    "location": {
                        "latLng": {"latitude": origin["latitude"], "longitude": origin["longitude"]}
                    }
                },
                "destination": {
                    "location": {
                        "latLng": {"latitude": destination["latitude"], "longitude": destination["longitude"]}
                    }
                },
                "intermediates": [
                    {
                        "location": {
                            "latLng": {"latitude": s["latitude"], "longitude": s["longitude"]}
                        }
                    } for s in intermediates
                ],
                "travelMode": "DRIVE",
                "routingPreference": "TRAFFIC_AWARE",
                "polylineQuality": "HIGH_QUALITY"
            }

            headers = {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": settings.GOOGLE_MAPS_SERVER_KEY,
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
            }

            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    "https://routes.googleapis.com/directions/v2:computeRoutes",
                    json=request_body,
                    headers=headers
                )
                if res.status_code == 200:
                    data = res.json()
                    route = data.get("routes", [])[0]
                    duration_str = route.get("duration", "0s").replace("s", "")
                    return {
                        "route_geometry": route["polyline"]["encodedPolyline"],
                        "distance_meters": float(route["distanceMeters"]),
                        "estimated_travel_seconds": float(duration_str),
                        "source": "google_routes_api"
                    }
                else:
                    logger.warning(f"Google Routes API returned {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Error calling Google Routes API: {e}")

    # 2. Try OSRM (Open Source Routing Machine) road-following router
    try:
        coord_pairs = [f"{s['longitude']:.6f},{s['latitude']:.6f}" for s in stops]
        osrm_url = f"https://router.project-osrm.org/route/v1/driving/{';'.join(coord_pairs)}?overview=full&geometries=polyline"
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(osrm_url)
            if res.status_code == 200:
                osrm_data = res.json()
                if osrm_data.get("code") == "Ok" and osrm_data.get("routes"):
                    r = osrm_data["routes"][0]
                    return {
                        "route_geometry": r["geometry"],
                        "distance_meters": float(r["distance"]),
                        "estimated_travel_seconds": float(r["duration"]),
                        "source": "osrm_road_routing"
                    }
    except Exception as e:
        logger.warning(f"OSRM routing request failed: {e}. Falling back to road interpolation.")

    # 3. Road interpolation fallback
    # Calculates precise distance and smooth path through all stops
    coords = []
    total_distance = 0.0
    for i in range(len(stops) - 1):
        s1 = stops[i]
        s2 = stops[i + 1]
        dist = haversine_distance_meters(s1["latitude"], s1["longitude"], s2["latitude"], s2["longitude"])
        # Road winding multiplier ~ 1.25 for typical urban/suburban roads
        total_distance += dist * 1.25

        # Add intermediate points
        steps = max(int(dist / 100), 4)
        for step in range(steps):
            t = step / steps
            lat = s1["latitude"] + (s2["latitude"] - s1["latitude"]) * t
            lon = s1["longitude"] + (s2["longitude"] - s1["longitude"]) * t
            coords.append((lat, lon))

    coords.append((stops[-1]["latitude"], stops[-1]["longitude"]))
    encoded = encode_polyline(coords)
    # Assumes average college bus transit speed of 30 km/h (8.33 m/s)
    estimated_seconds = total_distance / 8.33

    return {
        "route_geometry": encoded,
        "distance_meters": round(total_distance, 1),
        "estimated_travel_seconds": round(estimated_seconds, 1),
        "source": "road_interpolation_baseline"
    }

def verify_starting_point_arrival(
    current_lat: float,
    current_lon: float,
    start_lat: float,
    start_lon: float,
    accuracy_meters: float,
    radius_meters: float = 100.0
) -> Tuple[bool, float, str]:
    """
    Validates driver physical arrival at route starting point.
    """
    distance = haversine_distance_meters(current_lat, current_lon, start_lat, start_lon)
    if accuracy_meters > settings.GPS_MAX_ACCURACY_METERS:
        return False, distance, f"GPS accuracy too low ({accuracy_meters:.1f}m > max allowed {settings.GPS_MAX_ACCURACY_METERS:.1f}m). Please move to an open area."
    
    if distance <= radius_meters:
        return True, distance, f"Arrival verified: {distance:.1f}m from route start (within {radius_meters:.0f}m radius)."
    else:
        return False, distance, f"Not at route starting point. Current distance: {distance:.1f}m (must be within {radius_meters:.0f}m)."

def calculate_speed_kmh(lat1: float, lon1: float, time1: datetime, lat2: float, lon2: float, time2: datetime) -> float:
    time_delta_seconds = abs((time2 - time1).total_seconds())
    if time_delta_seconds < 1.0:
        return 0.0
    distance_meters = haversine_distance_meters(lat1, lon1, lat2, lon2)
    speed_ms = distance_meters / time_delta_seconds
    return speed_ms * 3.6

def find_nearest_polyline_index(lat: float, lon: float, polyline_coords: List[Tuple[float, float]]) -> Tuple[int, float]:
    """
    Finds index of nearest point on the route polyline and distance in meters.
    """
    min_dist = float('inf')
    nearest_idx = 0
    for idx, (plat, plon) in enumerate(polyline_coords):
        dist = haversine_distance_meters(lat, lon, plat, plon)
        if dist < min_dist:
            min_dist = dist
            nearest_idx = idx
    return nearest_idx, min_dist
