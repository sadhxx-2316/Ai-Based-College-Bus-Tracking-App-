from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from bson import ObjectId
import bcrypt
from app.db.mongodb import get_database
from app.schemas.enums import UserRole, AccountStatus

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:72],
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8")[:72], salt).decode("utf-8")

class UserRepository:
    @property
    def collection(self):
        return get_database().users

    async def get_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(user_id)
        except Exception:
            return None
        doc = await self.collection.find_one({"_id": oid})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def get_by_firebase_uid(self, firebase_uid: str) -> Optional[Dict[str, Any]]:
        doc = await self.collection.find_one({"firebase_uid": firebase_uid})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        doc = await self.collection.find_one({"email": email.lower()})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def create_user(
        self,
        firebase_uid: str,
        email: str,
        name: str,
        role: UserRole = UserRole.STUDENT,
        account_status: AccountStatus = AccountStatus.ACTIVE,
        phone: Optional[str] = None,
        password_hash: Optional[str] = None,
        extra_fields: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        user_doc = {
            "firebase_uid": firebase_uid,
            "email": email.lower(),
            "name": name,
            "role": role.value if hasattr(role, "value") else role,
            "account_status": account_status.value if hasattr(account_status, "value") else account_status,
            "phone": phone,
            "password_hash": password_hash,
            "created_at": now,
            "updated_at": now
        }
        if extra_fields:
            user_doc.update(extra_fields)

        res = await self.collection.insert_one(user_doc)
        user_doc["_id"] = str(res.inserted_id)
        return user_doc

    async def update_user(self, user_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(user_id)
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

    async def list_users(self, role: Optional[UserRole] = None, status: Optional[AccountStatus] = None) -> List[Dict[str, Any]]:
        query = {}
        if role:
            query["role"] = role.value if hasattr(role, "value") else role
        if status:
            query["account_status"] = status.value if hasattr(status, "value") else status
        cursor = self.collection.find(query).sort("created_at", -1)
        users = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            users.append(doc)
        return users

    async def list_managers(self, status: Optional[AccountStatus] = None) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"role": UserRole.BUS_MANAGER.value}
        if status:
            query["account_status"] = status.value if hasattr(status, "value") else status
        cursor = self.collection.find(query).sort("created_at", -1)
        managers = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            managers.append(doc)
        return managers

    async def review_manager(self, manager_id: str, new_status: AccountStatus, review_notes: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            oid = ObjectId(manager_id)
        except Exception:
            return None
        now = datetime.now(timezone.utc)
        res = await self.collection.find_one_and_update(
            {"_id": oid, "role": UserRole.BUS_MANAGER.value},
            {
                "$set": {
                    "account_status": new_status.value if hasattr(new_status, "value") else new_status,
                    "review_notes": review_notes,
                    "reviewed_at": now,
                    "updated_at": now
                }
            },
            return_document=True
        )
        if res:
            res["_id"] = str(res["_id"])
        return res

user_repo = UserRepository()
