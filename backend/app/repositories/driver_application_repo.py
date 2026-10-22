from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongodb import get_database
from app.schemas.enums import DriverApplicationStatus

class DriverApplicationRepository:
    @property
    def collection(self):
        return get_database().driver_applications

    async def get_by_id(self, application_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(application_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def get_by_user_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.collection.find_one({"user_id": user_id})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def create_application(
        self,
        user_id: str,
        license_number: str,
        years_of_experience: int,
        emergency_contact: str,
        notes: Optional[str] = None,
        document_references: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": user_id,
            "license_number": license_number.strip().upper(),
            "years_of_experience": years_of_experience,
            "emergency_contact": emergency_contact.strip(),
            "notes": notes,
            "document_references": document_references or [],
            "application_status": DriverApplicationStatus.PENDING.value,
            "reviewed_by": None,
            "reviewed_at": None,
            "review_notes": None,
            "created_at": now,
            "updated_at": now
        }
        res = await self.collection.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def review_application(
        self,
        application_id: str,
        status: DriverApplicationStatus,
        reviewed_by: str,
        review_notes: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(application_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        res = await self.collection.find_one_and_update(
            {"_id": oid},
            {
                "$set": {
                    "application_status": status.value if hasattr(status, "value") else status,
                    "reviewed_by": reviewed_by,
                    "reviewed_at": now,
                    "review_notes": review_notes,
                    "updated_at": now
                }
            },
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

    async def list_applications(self, status: Optional[DriverApplicationStatus] = None) -> List[Dict[str, Any]]:
        query = {}
        if status:
            query["application_status"] = status.value if hasattr(status, "value") else status
        cursor = self.collection.find(query).sort("created_at", -1)
        apps = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            apps.append(doc)
        return apps

    async def count_applications(self, query: Optional[Dict[str, Any]] = None) -> int:
        return await self.collection.count_documents(query or {})

driver_app_repo = DriverApplicationRepository()
