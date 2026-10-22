from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.schemas.enums import DriverApplicationStatus

class DriverApplicationCreate(BaseModel):
    license_number: str = Field(..., min_length=3, max_length=50)
    years_of_experience: int = Field(..., ge=0, le=60)
    emergency_contact: str = Field(..., min_length=5, max_length=100)
    notes: Optional[str] = None
    document_references: Optional[List[str]] = Field(default_factory=list)

class DriverApplicationReview(BaseModel):
    status: DriverApplicationStatus = Field(..., description="Approved or Rejected")
    review_notes: Optional[str] = None

class DriverApplicationResponse(BaseModel):
    id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_phone: Optional[str] = None
    license_number: str
    years_of_experience: int
    emergency_contact: str
    notes: Optional[str] = None
    document_references: List[str]
    application_status: DriverApplicationStatus
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
