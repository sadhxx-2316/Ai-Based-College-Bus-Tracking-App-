from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class StopBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    place_id: Optional[str] = None
    address: Optional[str] = None

class StopCreate(StopBase):
    pass

class StopUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    place_id: Optional[str] = None
    address: Optional[str] = None

class StopResponse(StopBase):
    id: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
