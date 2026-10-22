from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongodb import get_database
from app.schemas.enums import BusStatus

class BusRepository:
    @property
    def collection(self):
        return get_database().buses

    async def get_by_id(self, bus_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(bus_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def get_by_bus_number(self, bus_number: str) -> Optional[Dict[str, Any]]:
        doc = await self.collection.find_one({"bus_number": bus_number.strip().upper()})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def create_bus(self, bus_number: str, capacity: int, registration_number: Optional[str] = None, operational_status: BusStatus = BusStatus.ACTIVE) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "bus_number": bus_number.strip().upper(),
            "registration_number": registration_number.strip().upper() if registration_number else None,
            "capacity": capacity,
            "operational_status": operational_status.value if hasattr(operational_status, "value") else operational_status,
            "created_at": now,
            "updated_at": now
        }
        res = await self.collection.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def update_bus(self, bus_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(bus_id)
        except Exception:
            return None
        update_data["updated_at"] = datetime.now(timezone.utc)
        if "bus_number" in update_data and update_data["bus_number"]:
            update_data["bus_number"] = update_data["bus_number"].strip().upper()
        if "registration_number" in update_data and update_data["registration_number"]:
            update_data["registration_number"] = update_data["registration_number"].strip().upper()
        if "operational_status" in update_data and hasattr(update_data["operational_status"], "value"):
            update_data["operational_status"] = update_data["operational_status"].value

        res = await self.collection.find_one_and_update(
            {"_id": oid},
            {"$set": update_data},
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

    async def list_buses(self, status: Optional[BusStatus] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
        query = {}
        if status:
            query["operational_status"] = status.value if hasattr(status, "value") else status
        if search:
            query["$or"] = [
                {"bus_number": {"$regex": search, "$options": "i"}},
                {"registration_number": {"$regex": search, "$options": "i"}}
            ]
        cursor = self.collection.find(query).sort("bus_number", 1)
        buses = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            buses.append(doc)
        return buses

    async def count_buses(self, query: Optional[Dict[str, Any]] = None) -> int:
        return await self.collection.count_documents(query or {})

bus_repo = BusRepository()
