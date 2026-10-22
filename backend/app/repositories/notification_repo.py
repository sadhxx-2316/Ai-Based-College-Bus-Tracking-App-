from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongodb import get_database
from app.schemas.enums import NotificationType

class NotificationRepository:
    @property
    def collection(self):
        return get_database().notifications

    async def create_notification(
        self,
        recipient_user_id: str,
        notification_type: NotificationType,
        title: str,
        message: str,
        related_entity_id: Optional[str] = None
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "recipient_user_id": recipient_user_id,
            "notification_type": notification_type.value if hasattr(notification_type, "value") else notification_type,
            "title": title,
            "message": message,
            "related_entity_id": related_entity_id,
            "is_read": False,
            "created_at": now,
            "read_at": None
        }
        res = await self.collection.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def list_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"recipient_user_id": user_id}
        if unread_only:
            query["is_read"] = False
        cursor = self.collection.find(query).sort("created_at", -1).limit(limit)
        notifications = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            notifications.append(doc)
        return notifications

    async def mark_as_read(self, notification_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(notification_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        res = await self.collection.find_one_and_update(
            {"_id": oid, "recipient_user_id": user_id},
            {"$set": {"is_read": True, "read_at": now}},
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

notification_repo = NotificationRepository()
