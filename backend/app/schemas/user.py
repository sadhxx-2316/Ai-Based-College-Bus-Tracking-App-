from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from datetime import datetime
from app.schemas.enums import UserRole, AccountStatus

class UserBase(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=100)
    phone: Optional[str] = None
    role: UserRole = UserRole.STUDENT

class UserCreate(UserBase):
    firebase_uid: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    account_status: Optional[AccountStatus] = None
    role: Optional[UserRole] = None

class UserInDB(UserBase):
    id: str = Field(alias="_id")
    firebase_uid: str
    account_status: AccountStatus = AccountStatus.ACTIVE
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(populate_by_name=True)

class UserResponse(BaseModel):
    id: str
    firebase_uid: str
    email: str
    name: str
    phone: Optional[str] = None
    role: UserRole
    account_status: AccountStatus
    employee_id: Optional[str] = None
    department: Optional[str] = None
    license_number: Optional[str] = None
    roll_number: Optional[str] = None
    year: Optional[str] = None
    boarding_stop_id: Optional[str] = None
    boarding_stop_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    name: str = Field(..., min_length=2, max_length=100)
    phone: Optional[str] = None
    role: UserRole = UserRole.STUDENT
    # Student specific registration fields
    roll_number: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None
    boarding_stop_id: Optional[str] = None
    boarding_stop_name: Optional[str] = None
    # Driver specific registration fields
    license_number: Optional[str] = None
    years_of_experience: Optional[int] = None
    emergency_contact: Optional[str] = None
    # Manager specific registration fields
    employee_id: Optional[str] = None

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: Optional[UserRole] = None

class ManagerReviewRequest(BaseModel):
    action: str = Field(..., description="'approve' or 'reject'")
    notes: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    message: Optional[str] = None
