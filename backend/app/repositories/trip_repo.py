from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongodb import get_database
from app.schemas.enums import TripStatus

class TripRepository:
    @property
    def collection(self):
        return get_database().trips

    async def get_by_id(self, trip_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(trip_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def get_by_assignment_id(self, assignment_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.collection.find_one({"assignment_id": assignment_id})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def get_active_trip_by_driver(self, driver_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.collection.find_one({
            "driver_id": driver_id,
            "trip_status": TripStatus.ACTIVE.value
        })
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def get_active_trip_by_bus(self, bus_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.collection.find_one({
            "bus_id": bus_id,
            "trip_status": TripStatus.ACTIVE.value
        })
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def create_or_get_scheduled_trip(
        self,
        assignment_id: str,
        bus_id: str,
        driver_id: str,
        route_id: str
    ) -> Dict[str, Any]:
        existing = await self.get_by_assignment_id(assignment_id)
        if existing:
            return existing

        now = datetime.now(timezone.utc)
        doc = {
            "assignment_id": assignment_id,
            "bus_id": bus_id,
            "driver_id": driver_id,
            "route_id": route_id,
            "trip_status": TripStatus.SCHEDULED.value,
            "arrival_verification_status": False,
            "arrival_verified_at": None,
            "started_at": None,
            "ended_at": None,
            "start_location": None,
            "end_location": None,
            "created_at": now,
            "updated_at": now
        }
        res = await self.collection.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def record_arrival_verification(
        self,
        trip_id: str,
        verified: bool,
        location: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(trip_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        update_data = {
            "arrival_verification_status": verified,
            "arrival_verified_at": now if verified else None,
            "start_location": location if verified else None,
            "updated_at": now
        }
        res = await self.collection.find_one_and_update(
            {"_id": oid},
            {"$set": update_data},
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

    async def start_trip(self, trip_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(trip_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        # Only transition from SCHEDULED to ACTIVE
        res = await self.collection.find_one_and_update(
            {
                "_id": oid,
                "trip_status": TripStatus.SCHEDULED.value,
                "arrival_verification_status": True
            },
            {
                "$set": {
                    "trip_status": TripStatus.ACTIVE.value,
                    "started_at": now,
                    "updated_at": now
                }
            },
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

    async def end_trip(self, trip_id: str, end_location: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(trip_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        # Only transition from ACTIVE to COMPLETED
        res = await self.collection.find_one_and_update(
            {
                "_id": oid,
                "trip_status": TripStatus.ACTIVE.value
            },
            {
                "$set": {
                    "trip_status": TripStatus.COMPLETED.value,
                    "ended_at": now,
                    "end_location": end_location,
                    "updated_at": now
                }
            },
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

    async def list_trips(
        self,
        route_id: Optional[str] = None,
        bus_id: Optional[str] = None,
        driver_id: Optional[str] = None,
        status: Optional[TripStatus] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        if route_id:
            query["route_id"] = route_id
        if bus_id:
            query["bus_id"] = bus_id
        if driver_id:
            query["driver_id"] = driver_id
        if status:
            query["trip_status"] = status.value if hasattr(status, "value") else status

        cursor = self.collection.find(query).sort("created_at", -1).limit(limit)
        trips = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            trips.append(doc)
        return trips

    async def count_trips(self, query: Optional[Dict[str, Any]] = None) -> int:
        return await self.collection.count_documents(query or {})

trip_repo = TripRepository()
