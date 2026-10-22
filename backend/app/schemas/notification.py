from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.schemas.enums import NotificationType

class NotificationResponse(BaseModel):
    id: str
    recipient_user_id: str
    notification_type: NotificationType
    title: str
    message: str
    related_entity_id: Optional[str] = None
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None

class NotificationMarkReadResponse(BaseModel):
    id: str
    is_read: bool
    read_at: datetime
