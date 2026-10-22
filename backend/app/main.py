from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, status
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import logging

from app.core.config import settings
from app.db.mongodb import connect_to_mongo, close_mongo_connection, mongo_manager
from app.services.auth_service import verify_token
from app.repositories.user_repo import user_repo
from app.websocket.connection_manager import ws_manager

# API Route imports
from app.api.routes import (
    auth,
    buses,
    stops,
    routes,
    driver_applications,
    assignments,
    trips,
    student,
    manager,
    admin
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("college_bus.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.PROJECT_NAME}...")
    await connect_to_mongo()
    yield
    logger.info("Shutting down application...")
    await close_mongo_connection()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Production full-stack real-time college bus tracking and smart ETA prediction API.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health Checks
@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health_check():
    db_connected = False
    if mongo_manager.client:
        try:
            await mongo_manager.client.admin.command('ping')
            db_connected = True
        except Exception:
            db_connected = False

    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "database_connected": db_connected,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# Authenticated WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="Authentication token (JWT or Firebase ID token)")
):
    try:
        token_data = await verify_token(token)
        # Find user
        user = None
        if "uid" in token_data:
            user = await user_repo.get_by_firebase_uid(token_data["uid"])
        elif "sub" in token_data:
            user = await user_repo.get_by_firebase_uid(token_data["sub"]) or await user_repo.get_by_id(token_data["sub"])
        elif "email" in token_data:
            user = await user_repo.get_by_email(token_data["email"])

        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        user_info = {
            "id": user["_id"],
            "email": user["email"],
            "role": user["role"],
            "name": user["name"]
        }
    except Exception as e:
        logger.warning(f"WebSocket auth failed: {e}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect(websocket, user_info)
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            channel = data.get("channel")

            if action == "subscribe" and channel:
                # Restrict channels based on role
                if channel.startswith("manager") and user_info["role"] != "bus_manager":
                    await websocket.send_json({"error": "Unauthorized subscription to manager channel."})
                else:
                    ws_manager.subscribe(websocket, channel)
                    await websocket.send_json({"status": "subscribed", "channel": channel})

            elif action == "unsubscribe" and channel:
                ws_manager.unsubscribe(websocket, channel)
                await websocket.send_json({"status": "unsubscribed", "channel": channel})

            elif action == "ping":
                await websocket.send_json({"action": "pong", "timestamp": datetime.now(timezone.utc).isoformat()})

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)

# Include API Routers under /api
app.include_router(auth.router, prefix="/api")
app.include_router(buses.router, prefix="/api")
app.include_router(stops.router, prefix="/api")
app.include_router(routes.router, prefix="/api")
app.include_router(driver_applications.router, prefix="/api")
app.include_router(assignments.router, prefix="/api")
app.include_router(trips.router, prefix="/api")
app.include_router(student.router, prefix="/api")
app.include_router(manager.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
