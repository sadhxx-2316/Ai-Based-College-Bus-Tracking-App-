from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongodb import get_database
from app.schemas.enums import AssignmentStatus

class AssignmentRepository:
    @property
    def collection(self):
        return get_database().driver_assignments

    async def get_by_id(self, assignment_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(assignment_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def find_conflict(
        self,
        service_date: str,
        scheduled_departure: str,
        bus_id: Optional[str] = None,
        driver_id: Optional[str] = None,
        exclude_assignment_id: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Checks if the bus or driver is already assigned on the same date/time in active/pending status.
        """
        query: Dict[str, Any] = {
            "service_date": service_date,
            "scheduled_departure": scheduled_departure,
            "assignment_status": {"$in": [AssignmentStatus.PENDING.value, AssignmentStatus.ACCEPTED.value]}
        }
        if exclude_assignment_id:
            try:
                query["_id"] = {"$ne": ObjectId(exclude_assignment_id)}
            except Exception:
                pass

        or_conditions = []
        if bus_id:
            or_conditions.append({"bus_id": bus_id})
        if driver_id:
            or_conditions.append({"driver_id": driver_id})

        if not or_conditions:
            return None

        query["$or"] = or_conditions
        doc = await self.collection.find_one(query)
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def create_assignment(
        self,
        bus_id: str,
        driver_id: str,
        route_id: str,
        service_date: str,
        scheduled_departure: str,
        scheduled_end: Optional[str] = None,
        assigned_by: Optional[str] = None
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "bus_id": bus_id,
            "driver_id": driver_id,
            "route_id": route_id,
            "service_date": service_date,
            "scheduled_departure": scheduled_departure,
            "scheduled_end": scheduled_end,
            "assignment_status": AssignmentStatus.PENDING.value,
            "assigned_by": assigned_by,
            "assigned_at": now,
            "responded_at": None,
            "cancellation_reason": None,
            "created_at": now,
            "updated_at": now
        }
        res = await self.collection.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def respond_to_assignment(
        self,
        assignment_id: str,
        driver_id: str,
        status: AssignmentStatus,
        cancellation_reason: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(assignment_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        # Only allow transition if currently PENDING and belongs to this driver
        res = await self.collection.find_one_and_update(
            {
                "_id": oid,
                "driver_id": driver_id,
                "assignment_status": AssignmentStatus.PENDING.value
            },
            {
                "$set": {
                    "assignment_status": status.value if hasattr(status, "value") else status,
                    "responded_at": now,
                    "cancellation_reason": cancellation_reason,
                    "updated_at": now
                }
            },
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

    async def cancel_assignment(self, assignment_id: str, reason: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(assignment_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        res = await self.collection.find_one_and_update(
            {
                "_id": oid,
                "assignment_status": {"$in": [AssignmentStatus.PENDING.value, AssignmentStatus.ACCEPTED.value]}
            },
            {
                "$set": {
                    "assignment_status": AssignmentStatus.CANCELLED.value,
                    "cancellation_reason": reason,
                    "updated_at": now
                }
            },
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

    async def list_assignments(
        self,
        driver_id: Optional[str] = None,
        bus_id: Optional[str] = None,
        service_date: Optional[str] = None,
        status: Optional[AssignmentStatus] = None
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        if driver_id:
            query["driver_id"] = driver_id
        if bus_id:
            query["bus_id"] = bus_id
        if service_date:
            query["service_date"] = service_date
        if status:
            query["assignment_status"] = status.value if hasattr(status, "value") else status

        cursor = self.collection.find(query).sort("created_at", -1)
        assignments = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            assignments.append(doc)
        return assignments

    async def count_assignments(self, query: Optional[Dict[str, Any]] = None) -> int:
        return await self.collection.count_documents(query or {})

assignment_repo = AssignmentRepository()
