from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class DashboardMetricsResponse(BaseModel):
    total_buses: int
    active_buses: int
    available_buses: int
    approved_drivers: int
    pending_driver_applications: int
    active_trips: int
    pending_assignments: int
    stale_or_unavailable_gps: int

class TripAnalyticsResponse(BaseModel):
    total_trips_completed: int
    average_trip_duration_minutes: float
    on_time_departure_rate: float
    stale_gps_incidents: int
    speed_alerts: int
