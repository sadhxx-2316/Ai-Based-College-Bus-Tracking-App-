from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.schemas.stop import StopResponse

class RouteBase(BaseModel):
    route_name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = None
    ordered_stop_ids: List[str] = Field(..., min_length=2, description="At least origin and destination stop IDs")

class RouteCreate(RouteBase):
    route_geometry: Optional[str] = None
    distance_meters: Optional[float] = None
    estimated_travel_seconds: Optional[float] = None

class RouteUpdate(BaseModel):
    route_name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = None
    ordered_stop_ids: Optional[List[str]] = Field(None, min_length=2)
    route_geometry: Optional[str] = None
    distance_meters: Optional[float] = None
    estimated_travel_seconds: Optional[float] = None
    route_status: Optional[str] = None

class RoutePreviewRequest(BaseModel):
    ordered_stop_ids: List[str] = Field(..., min_length=2)

class RoutePreviewResponse(BaseModel):
    route_geometry: str
    distance_meters: float
    estimated_travel_seconds: float
    stops: List[StopResponse]

class RouteResponse(BaseModel):
    id: str
    route_name: str
    description: Optional[str] = None
    origin_stop_id: str
    destination_stop_id: str
    ordered_stop_ids: List[str]
    stops: Optional[List[StopResponse]] = None
    route_geometry: str
    distance_meters: float
    estimated_travel_seconds: float
    route_status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
