import logging
import json
from typing import Dict, List, Set, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime, timezone

logger = logging.getLogger("college_bus.websocket")

class ConnectionManager:
    def __init__(self):
        # Maps client_id/socket to its subscribed channels
        self.active_connections: Dict[WebSocket, Dict[str, Any]] = {}
        # Channel to set of WebSockets
        self.channel_subscribers: Dict[str, Set[WebSocket]] = {
            "manager": set()
        }

    async def connect(self, websocket: WebSocket, user_info: Dict[str, Any]):
        await websocket.accept()
        self.active_connections[websocket] = user_info
        
        # Auto-subscribe to personal user channel
        user_id = user_info.get("id")
        if user_id:
            self.subscribe(websocket, f"user:{user_id}")

        # If manager, auto-subscribe to manager channel
        if user_info.get("role") == "bus_manager":
            self.subscribe(websocket, "manager")

        logger.info(f"WebSocket connected for user {user_info.get('email')} (role: {user_info.get('role')})")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            user = self.active_connections.pop(websocket)
            logger.info(f"WebSocket disconnected for user {user.get('email')}")

        for channel, subscribers in list(self.channel_subscribers.items()):
            subscribers.discard(websocket)
            if not subscribers and channel != "manager":
                del self.channel_subscribers[channel]

    def subscribe(self, websocket: WebSocket, channel: str):
        if channel not in self.channel_subscribers:
            self.channel_subscribers[channel] = set()
        self.channel_subscribers[channel].add(websocket)

    def unsubscribe(self, websocket: WebSocket, channel: str):
        if channel in self.channel_subscribers:
            self.channel_subscribers[channel].discard(websocket)

    async def broadcast_to_channel(self, channel: str, event_type: str, payload: Dict[str, Any]):
        message = {
            "event": event_type,
            "channel": channel,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": payload
        }
        subscribers = self.channel_subscribers.get(channel, set()).copy()
        for ws in subscribers:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Error sending message to websocket subscriber: {e}")
                self.disconnect(ws)

    async def broadcast_event(self, event_type: str, payload: Dict[str, Any], route_id: Optional[str] = None, trip_id: Optional[str] = None, recipient_user_id: Optional[str] = None):
        """
        Dispatches real-time events to all relevant channels:
        - Manager fleet channel
        - Specific user channel (if targeted)
        - Route channel (for subscribed students)
        - Trip channel (for live tracker)
        """
        # Always broadcast to manager channel
        await self.broadcast_to_channel("manager", event_type, payload)

        if recipient_user_id:
            await self.broadcast_to_channel(f"user:{recipient_user_id}", event_type, payload)

        if route_id:
            await self.broadcast_to_channel(f"route:{route_id}", event_type, payload)

        if trip_id:
            await self.broadcast_to_channel(f"trip:{trip_id}", event_type, payload)

ws_manager = ConnectionManager()
