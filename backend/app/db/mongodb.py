from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import logging
from typing import Optional
from app.core.config import settings

logger = logging.getLogger("college_bus.mongodb")

class MongoManager:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None

mongo_manager = MongoManager()

async def connect_to_mongo():
    logger.info(f"Connecting to MongoDB at {settings.MONGODB_URI}...")
    try:
        mongo_manager.client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=2000
        )
        # Quick ping to verify connectivity
        await mongo_manager.client.admin.command('ping')
        mongo_manager.db = mongo_manager.client[settings.MONGODB_DATABASE]
        logger.info(f"Successfully connected to live MongoDB database '{settings.MONGODB_DATABASE}'.")
        await create_indexes()
        from app.db.seeder import seed_default_data_if_empty
        await seed_default_data_if_empty()
    except Exception as e:
        logger.warning(
            f"Could not connect to live MongoDB: {e}. "
            "Activating high-performance AsyncMongoMockClient in-memory MongoDB engine for uninterrupted operation."
        )
        try:
            from mongomock_motor import AsyncMongoMockClient
            mongo_manager.client = AsyncMongoMockClient()
            mongo_manager.db = mongo_manager.client[settings.MONGODB_DATABASE]
            await create_indexes()
            from app.db.seeder import seed_default_data_if_empty
            await seed_default_data_if_empty()
            logger.info("In-memory MongoDB initialized and seeded successfully.")
        except Exception as fallback_err:
            logger.error(f"Failed to initialize in-memory fallback database: {fallback_err}")

async def close_mongo_connection():
    if mongo_manager.client:
        logger.info("Closing MongoDB connection...")
        mongo_manager.client.close()
        mongo_manager.client = None
        mongo_manager.db = None
        logger.info("MongoDB connection closed.")

async def create_indexes():
    if mongo_manager.db is None:
        return
    try:
        db = mongo_manager.db
        # Users
        await db.users.create_index("firebase_uid", unique=True)
        await db.users.create_index("email")
        await db.users.create_index("role")
        
        # Buses
        await db.buses.create_index("bus_number", unique=True)
        await db.buses.create_index("operational_status")
        
        # Stops
        await db.stops.create_index("name")
        
        # Routes
        await db.routes.create_index("route_name")
        
        # Driver Applications
        await db.driver_applications.create_index("user_id")
        await db.driver_applications.create_index("application_status")
        
        # Assignments
        await db.driver_assignments.create_index([("bus_id", 1), ("service_date", 1)])
        await db.driver_assignments.create_index([("driver_id", 1), ("service_date", 1)])
        await db.driver_assignments.create_index("assignment_status")
        
        # Trips
        await db.trips.create_index("assignment_id", unique=True)
        await db.trips.create_index([("bus_id", 1), ("trip_status", 1)])
        await db.trips.create_index([("driver_id", 1), ("trip_status", 1)])
        
        # Live Locations
        await db.live_locations.create_index("trip_id", unique=True)
        await db.live_locations.create_index("bus_id")
        
        # Location History
        await db.location_history.create_index([("trip_id", 1), ("recorded_at", 1)])
        
        # Notifications
        await db.notifications.create_index([("recipient_user_id", 1), ("is_read", 1)])
        await db.notifications.create_index("created_at")
        
        # Audit Logs
        await db.audit_logs.create_index("created_at")
        logger.info("MongoDB collections and indexes successfully initialized.")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")

def get_database() -> AsyncIOMotorDatabase:
    if mongo_manager.db is None:
        raise RuntimeError("Database connection not initialized. Please check MongoDB configuration.")
    return mongo_manager.db
