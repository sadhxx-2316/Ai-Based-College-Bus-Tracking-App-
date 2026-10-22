from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.schemas.enums import TripStatus
from app.schemas.bus import BusResponse
from app.schemas.route import RouteResponse

class ArrivalCheckRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    accuracy_meters: float = Field(..., gt=0.0, le=500.0)
    recorded_at: Optional[datetime] = None

class ArrivalCheckResponse(BaseModel):
    verified: bool
    distance_to_start_meters: float
    threshold_meters: float
    verified_at: Optional[datetime] = None
    message: str

class StartTripResponse(BaseModel):
    trip_id: str
    assignment_id: str
    trip_status: TripStatus
    started_at: datetime
    message: str

class LocationSubmission(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    accuracy_meters: float = Field(..., gt=0.0)
    recorded_at: datetime
    sequence_number: int = Field(..., ge=0)
    speed_kmh: Optional[float] = Field(None, ge=0.0)

class LocationSubmissionResponse(BaseModel):
    success: bool
    trip_id: str
    sequence_number: int
    received_at: datetime
    is_anomaly: bool = False
    warning: Optional[str] = None

class LiveLocationResponse(BaseModel):
    trip_id: str
    bus_id: str
    bus_number: Optional[str] = None
    route_name: Optional[str] = None
    latitude: float
    longitude: float
    accuracy_meters: float
    speed_kmh: Optional[float] = 0.0
    recorded_at: datetime
    received_at: datetime
    sequence_number: int
    is_stale: bool
    stale_seconds: float

class EndTripResponse(BaseModel):
    trip_id: str
    trip_status: TripStatus
    ended_at: datetime
    message: str

class LocationHistoryPoint(BaseModel):
    latitude: float
    longitude: float
    accuracy_meters: float
    recorded_at: datetime

class TripResponse(BaseModel):
    id: str
    assignment_id: str
    bus_id: str
    driver_id: str
    route_id: str
    trip_status: TripStatus
    arrival_verification_status: bool
    arrival_verified_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    bus: Optional[BusResponse] = None
    route: Optional[RouteResponse] = None
    driver_name: Optional[str] = None
    latest_location: Optional[LiveLocationResponse] = None
    created_at: datetime
    updated_at: datetime
