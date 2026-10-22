from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongodb import get_database

class LocationRepository:
    @property
    def live_collection(self):
        return get_database().live_locations

    @property
    def history_collection(self):
        return get_database().location_history

    async def get_live_location(self, trip_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.live_collection.find_one({"trip_id": trip_id})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def get_live_location_by_bus(self, bus_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.live_collection.find_one({"bus_id": bus_id})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def upsert_live_location(
        self,
        trip_id: str,
        bus_id: str,
        driver_id: str,
        latitude: float,
        longitude: float,
        accuracy_meters: float,
        recorded_at: datetime,
        sequence_number: int,
        speed_kmh: Optional[float] = 0.0
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "trip_id": trip_id,
            "bus_id": bus_id,
            "driver_id": driver_id,
            "latitude": float(latitude),
            "longitude": float(longitude),
            "accuracy_meters": float(accuracy_meters),
            "speed_kmh": float(speed_kmh) if speed_kmh is not None else 0.0,
            "recorded_at": recorded_at,
            "received_at": now,
            "sequence_number": sequence_number
        }
        res = await self.live_collection.find_one_and_update(
            {"trip_id": trip_id},
            {"$set": doc},
            upsert=True,
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
            return res
        return doc

    async def record_history(
        self,
        trip_id: str,
        bus_id: str,
        driver_id: str,
        latitude: float,
        longitude: float,
        accuracy_meters: float,
        recorded_at: datetime
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "trip_id": trip_id,
            "bus_id": bus_id,
            "driver_id": driver_id,
            "latitude": float(latitude),
            "longitude": float(longitude),
            "accuracy_meters": float(accuracy_meters),
            "recorded_at": recorded_at,
            "received_at": now
        }
        res = await self.history_collection.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def get_trip_history(self, trip_id: str, limit: int = 500) -> List[Dict[str, Any]]:
        cursor = self.history_collection.find({"trip_id": trip_id}).sort("recorded_at", 1).limit(limit)
        points = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            points.append(doc)
        return points

    async def remove_live_location(self, trip_id: str):
        await self.live_collection.delete_one({"trip_id": trip_id})

location_repo = LocationRepository()
