from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI-Enabled College Bus Tracking and Smart ETA Prediction System"
    API_V1_STR: str = "/api"
    
    # MongoDB
    MONGODB_URI: str = Field(default="mongodb://localhost:27017")
    MONGODB_DATABASE: str = Field(default="college_bus_tracking")
    
    # Firebase
    FIREBASE_PROJECT_ID: Optional[str] = None
    FIREBASE_CREDENTIALS_PATH: Optional[str] = None
    DEV_AUTH_BYPASS: bool = True  # Allows local dev tokens when Firebase Admin is not yet configured with private key
    
    # Google Maps / Routing
    GOOGLE_MAPS_SERVER_KEY: Optional[str] = None
    
    # Operational Thresholds
    ARRIVAL_RADIUS_METERS: float = 100.0  # Configurable arrival radius for starting-point verification
    GPS_STALE_AFTER_SECONDS: int = 60    # Threshold to mark GPS stream as stale
    GPS_MAX_AGE_SECONDS: int = 30        # Maximum allowable age for submitted GPS observation
    GPS_MAX_ACCURACY_METERS: float = 60.0 # Max allowable accuracy radius in meters
    SPEED_ANOMALY_KMH_THRESHOLD: float = 90.0 # Flag speed jumps / excessive speed
    MAX_PLAUSIBLE_JUMP_SPEED_KMH: float = 130.0 # GPS coordinate jumps that are physically impossible
    
    # Notification Proximity
    APPROACHING_STOP_METERS: float = 500.0
    APPROACHING_STOP_SECONDS: float = 180.0
    
    # JWT for Session / Dev Tokens
    JWT_SECRET: str = "college-bus-tracking-jwt-secret-key-2026-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"
    ]
    
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
