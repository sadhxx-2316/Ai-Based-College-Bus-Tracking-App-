from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
from app.db.mongodb import get_database

class RouteRepository:
    @property
    def collection(self):
        return get_database().routes

    async def get_by_id(self, route_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(route_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def create_route(
        self,
        route_name: str,
        origin_stop_id: str,
        destination_stop_id: str,
        ordered_stop_ids: List[str],
        route_geometry: str,
        distance_meters: float,
        estimated_travel_seconds: float,
        description: Optional[str] = None,
        created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "route_name": route_name.strip(),
            "description": description,
            "origin_stop_id": origin_stop_id,
            "destination_stop_id": destination_stop_id,
            "ordered_stop_ids": ordered_stop_ids,
            "route_geometry": route_geometry,
            "distance_meters": distance_meters,
            "estimated_travel_seconds": estimated_travel_seconds,
            "route_status": "active",
            "created_by": created_by,
            "created_at": now,
            "updated_at": now
        }
        res = await self.collection.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def update_route(self, route_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(route_id)
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

    async def list_routes(self, status: Optional[str] = "active") -> List[Dict[str, Any]]:
        query = {}
        if status:
            query["route_status"] = status
        cursor = self.collection.find(query).sort("route_name", 1)
        routes = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            routes.append(doc)
        return routes

    async def count_routes(self) -> int:
        return await self.collection.count_documents({})

    async def delete_route(self, route_id: str) -> bool:
        try:
            oid = ObjectId(route_id)
        except Exception:
            return False
        res = await self.collection.delete_one({"_id": oid})
        return res.deleted_count > 0

route_repo = RouteRepository()
