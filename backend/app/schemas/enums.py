from enum import Enum

class UserRole(str, Enum):
    STUDENT = "student"
    DRIVER = "driver"
    BUS_MANAGER = "bus_manager"
    ADMIN = "admin"

class AccountStatus(str, Enum):
    ACTIVE = "active"
    PENDING_REVIEW = "pending_review"
    REJECTED = "rejected"
    SUSPENDED = "suspended"

class BusStatus(str, Enum):
    ACTIVE = "active"
    MAINTENANCE = "maintenance"
    INACTIVE = "inactive"

class DriverApplicationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class AssignmentStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CANCELLED = "cancelled"

class TripStatus(str, Enum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class NotificationType(str, Enum):
    ASSIGNMENT_CREATED = "assignment_created"
    ASSIGNMENT_ACCEPTED = "assignment_accepted"
    ASSIGNMENT_REJECTED = "assignment_rejected"
    ASSIGNMENT_CANCELLED = "assignment_cancelled"
    TRIP_STARTED = "trip_started"
    TRIP_COMPLETED = "trip_completed"
    BUS_APPROACHING = "bus_approaching"
    GPS_STALE = "gps_stale"
    ROUTE_DEVIATION = "route_deviation"
    GENERAL = "general"
