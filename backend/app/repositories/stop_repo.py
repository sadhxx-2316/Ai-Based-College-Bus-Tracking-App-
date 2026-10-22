from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongodb import get_database

class StopRepository:
    @property
    def collection(self):
        return get_database().stops

    async def get_by_id(self, stop_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(stop_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def get_by_ids(self, stop_ids: List[str]) -> List[Dict[str, Any]]:
        oids = []
        for sid in stop_ids:
            try:
                oids.append(ObjectId(sid))
            except Exception:
                pass
        cursor = self.collection.find({"_id": {"$in": oids}})
        stops_by_id = {}
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            stops_by_id[doc["_id"]] = doc
        # Return in requested order
        ordered = [stops_by_id[sid] for sid in stop_ids if sid in stops_by_id]
        return ordered

    async def create_stop(self, name: str, latitude: float, longitude: float, place_id: Optional[str] = None, address: Optional[str] = None, created_by: Optional[str] = None) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "name": name.strip(),
            "latitude": float(latitude),
            "longitude": float(longitude),
            "place_id": place_id,
            "address": address,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now
        }
        res = await self.collection.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def update_stop(self, stop_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(stop_id)
        except Exception:
            return None
        update_data["updated_at"] = datetime.now(timezone.utc)
        res = await self.collection.find_one_and_update(
            {"_id": oid},
            {"$set": update_data},
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

    async def list_stops(self, search: Optional[str] = None) -> List[Dict[str, Any]]:
        query = {}
        if search:
            query["name"] = {"$regex": search, "$options": "i"}
        cursor = self.collection.find(query).sort("name", 1)
        stops = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            stops.append(doc)
        return stops

    async def delete_stop(self, stop_id: str) -> bool:
        try:
            oid = ObjectId(stop_id)
        except Exception:
            return False
        res = await self.collection.delete_one({"_id": oid})
        return res.deleted_count > 0

stop_repo = StopRepository()
