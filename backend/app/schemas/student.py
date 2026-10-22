from pydantic import BaseModel
from typing import Optional, List
from app.schemas.stop import StopResponse
from app.schemas.trip import LiveLocationResponse

class StudentFleetBus(BaseModel):
    bus_id: str
    bus_number: str
    registration_number: Optional[str] = None
    capacity: int = 50
    operational_status: str = "active"
    route_id: Optional[str] = None
    route_name: Optional[str] = None
    route_description: Optional[str] = None
    scheduled_departure: Optional[str] = None
    service_date: Optional[str] = None
    assignment_id: Optional[str] = None
    driver_name: Optional[str] = None
    trip_id: Optional[str] = None
    trip_status: str = "scheduled"  # "active" | "scheduled" | "completed" | "idle"
    stops: List[StopResponse] = []
    route_geometry: Optional[str] = None
    distance_meters: Optional[float] = None
    estimated_travel_seconds: Optional[float] = None
    latest_location: Optional[LiveLocationResponse] = None
