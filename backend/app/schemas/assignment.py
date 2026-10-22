from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.schemas.enums import AssignmentStatus
from app.schemas.bus import BusResponse
from app.schemas.route import RouteResponse

class AssignmentBase(BaseModel):
    bus_id: str
    driver_id: str
    route_id: str
    service_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Service date format: YYYY-MM-DD")
    scheduled_departure: str = Field(..., description="Scheduled departure time e.g. 08:30 or ISO timestamp")
    scheduled_end: Optional[str] = None

class AssignmentCreate(AssignmentBase):
    pass

class AssignmentRejectRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=250)

class AssignmentCancelRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=250)

class AssignmentResponse(AssignmentBase):
    id: str
    assignment_status: AssignmentStatus
    assigned_by: Optional[str] = None
    assigned_at: datetime
    responded_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    bus: Optional[BusResponse] = None
    route: Optional[RouteResponse] = None
    driver_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
