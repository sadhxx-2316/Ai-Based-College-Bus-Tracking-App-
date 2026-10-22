from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.schemas.enums import BusStatus

class BusBase(BaseModel):
    bus_number: str = Field(..., min_length=1, max_length=50, description="Unique bus number or designation")
    registration_number: Optional[str] = Field(None, max_length=50, description="License plate or vehicle registration")
    capacity: int = Field(..., gt=0, le=120, description="Passenger seating capacity")
    operational_status: BusStatus = BusStatus.ACTIVE

class BusCreate(BusBase):
    pass

class BusUpdate(BaseModel):
    bus_number: Optional[str] = Field(None, min_length=1, max_length=50)
    registration_number: Optional[str] = None
    capacity: Optional[int] = Field(None, gt=0, le=120)
    operational_status: Optional[BusStatus] = None

class BusStatusUpdate(BaseModel):
    operational_status: BusStatus

class BusResponse(BusBase):
    id: str
    created_at: datetime
    updated_at: datetime
