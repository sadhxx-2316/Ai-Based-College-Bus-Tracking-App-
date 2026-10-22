from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ETAResponse(BaseModel):
    trip_id: str
    stop_id: str
    stop_name: str
    eta_seconds: Optional[float] = None
    eta_minutes: Optional[float] = None
    estimated_arrival_time: Optional[datetime] = None
    distance_remaining_meters: Optional[float] = None
    is_bus_passed: bool = False
    is_stale: bool = False
    is_available: bool = True
    method: str = "route_baseline" # "route_baseline", "ml_model", "unavailable"
    accuracy_note: Optional[str] = None
