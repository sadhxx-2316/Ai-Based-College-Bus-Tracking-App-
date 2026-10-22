from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
from app.services.auth_service import require_roles
from app.schemas.enums import UserRole, AccountStatus, NotificationType
from app.schemas.user import UserResponse, ManagerReviewRequest
from app.repositories.user_repo import user_repo
from app.repositories.bus_repo import bus_repo
from app.repositories.trip_repo import trip_repo
from app.repositories.driver_application_repo import driver_app_repo
from app.repositories.notification_repo import notification_repo
from app.repositories.audit_repo import audit_repo
from app.websocket.connection_manager import ws_manager

router = APIRouter(prefix="/admin", tags=["System Administrator Operations"])

@router.get("/managers", response_model=List[UserResponse])
async def list_managers(
    status: Optional[AccountStatus] = None,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.ADMIN]))
):
    """
    Returns list of Transport Managers for Super Admin review.
    """
    managers = await user_repo.list_managers(status=status)
    return [
        UserResponse(
            id=m["_id"],
            firebase_uid=m["firebase_uid"],
            email=m["email"],
            name=m["name"],
            phone=m.get("phone"),
            role=m["role"],
            account_status=m["account_status"],
            employee_id=m.get("employee_id"),
            department=m.get("department"),
            license_number=m.get("license_number"),
            created_at=m["created_at"],
            updated_at=m["updated_at"]
        ) for m in managers
    ]

@router.post("/managers/{manager_id}/approve", response_model=UserResponse)
async def approve_manager(
    manager_id: str,
    review: Optional[ManagerReviewRequest] = None,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.ADMIN]))
):
    """
    Super Admin approves a registered Transport Manager, activating their permissions to manage fleet and drivers.
    """
    manager = await user_repo.get_by_id(manager_id)
    if not manager or manager.get("role") != UserRole.BUS_MANAGER.value:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transport Manager not found.")

    updated = await user_repo.review_manager(
        manager_id=manager_id,
        new_status=AccountStatus.ACTIVE,
        review_notes=review.notes if review else "Approved by System Administrator"
    )

    # Persistent notification to Manager
    mgr_notif = await notification_repo.create_notification(
        recipient_user_id=manager_id,
        notification_type=NotificationType.GENERAL,
        title="Manager Account Approved",
        message="Your Transport Manager account has been verified and approved by the System Administrator. You can now access full fleet operations."
    )

    await ws_manager.broadcast_event(
        event_type="notification.created",
        payload={
            "id": mgr_notif["_id"],
            "recipient_user_id": manager_id,
            "title": mgr_notif["title"],
            "message": mgr_notif["message"],
            "notification_type": mgr_notif["notification_type"],
            "is_read": False,
            "created_at": mgr_notif["created_at"].isoformat()
        },
        recipient_user_id=manager_id
    )

    await ws_manager.broadcast_event(
        event_type="manager.approved",
        payload={"manager_id": manager_id, "name": manager["name"]},
        recipient_user_id=manager_id
    )

    await audit_repo.log_action(
        action="approve_transport_manager",
        user_id=current_user["_id"],
        entity_type="user",
        entity_id=manager_id,
        details={"approved_manager_email": manager["email"]}
    )

    return UserResponse(
        id=updated["_id"],
        firebase_uid=updated["firebase_uid"],
        email=updated["email"],
        name=updated["name"],
        phone=updated.get("phone"),
        role=updated["role"],
        account_status=updated["account_status"],
        employee_id=updated.get("employee_id"),
        department=updated.get("department"),
        license_number=updated.get("license_number"),
        created_at=updated["created_at"],
        updated_at=updated["updated_at"]
    )

@router.post("/managers/{manager_id}/reject", response_model=UserResponse)
async def reject_manager(
    manager_id: str,
    review: Optional[ManagerReviewRequest] = None,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.ADMIN]))
):
    """
    Super Admin rejects a registered Transport Manager account.
    """
    manager = await user_repo.get_by_id(manager_id)
    if not manager or manager.get("role") != UserRole.BUS_MANAGER.value:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transport Manager not found.")

    notes = review.notes if review and review.notes else "Rejected by System Administrator"
    updated = await user_repo.review_manager(
        manager_id=manager_id,
        new_status=AccountStatus.REJECTED,
        review_notes=notes
    )

    await notification_repo.create_notification(
        recipient_user_id=manager_id,
        notification_type=NotificationType.GENERAL,
        title="Manager Account Update",
        message=f"Your Transport Manager account application was not approved. Note: {notes}"
    )

    return UserResponse(
        id=updated["_id"],
        firebase_uid=updated["firebase_uid"],
        email=updated["email"],
        name=updated["name"],
        phone=updated.get("phone"),
        role=updated["role"],
        account_status=updated["account_status"],
        employee_id=updated.get("employee_id"),
        department=updated.get("department"),
        license_number=updated.get("license_number"),
        created_at=updated["created_at"],
        updated_at=updated["updated_at"]
    )

@router.get("/dashboard")
async def get_admin_dashboard(current_user: Dict[str, Any] = Depends(require_roles([UserRole.ADMIN]))):
    """
    Super Admin high-level system metrics.
    """
    students_count = len(await user_repo.list_users(role=UserRole.STUDENT))
    drivers_count = len(await user_repo.list_users(role=UserRole.DRIVER))
    managers_count = len(await user_repo.list_users(role=UserRole.BUS_MANAGER))
    pending_managers = len(await user_repo.list_managers(status=AccountStatus.PENDING_REVIEW))
    pending_drivers = await driver_app_repo.count_applications({"application_status": "pending"})
    total_buses = await bus_repo.count_buses()
    total_trips = await trip_repo.count_trips()

    return {
        "students_count": students_count,
        "drivers_count": drivers_count,
        "managers_count": managers_count,
        "pending_managers": pending_managers,
        "pending_drivers": pending_drivers,
        "total_buses": total_buses,
        "total_trips": total_trips
    }
