from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
from app.services.auth_service import get_current_user, require_roles
from app.schemas.enums import UserRole, DriverApplicationStatus, AccountStatus, NotificationType
from app.schemas.driver_application import DriverApplicationCreate, DriverApplicationReview, DriverApplicationResponse
from app.repositories.driver_application_repo import driver_app_repo
from app.repositories.user_repo import user_repo
from app.repositories.notification_repo import notification_repo
from app.repositories.audit_repo import audit_repo
from app.websocket.connection_manager import ws_manager

router = APIRouter(prefix="", tags=["Driver Applications"])

@router.post("/driver-applications", response_model=DriverApplicationResponse, status_code=status.HTTP_201_CREATED)
async def submit_driver_application(
    app_in: DriverApplicationCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    existing = await driver_app_repo.get_by_user_id(current_user["_id"])
    if existing and existing["application_status"] == DriverApplicationStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have a pending driver application under review."
        )

    application = await driver_app_repo.create_application(
        user_id=current_user["_id"],
        license_number=app_in.license_number,
        years_of_experience=app_in.years_of_experience,
        emergency_contact=app_in.emergency_contact,
        notes=app_in.notes,
        document_references=app_in.document_references
    )

    # Set user status to pending_review
    await user_repo.update_user(current_user["_id"], {"account_status": AccountStatus.PENDING_REVIEW.value})

    # Notify managers
    await ws_manager.broadcast_event(
        event_type="driver_application.submitted",
        payload={
            "application_id": application["_id"],
            "user_id": current_user["_id"],
            "user_name": current_user["name"],
            "license_number": application["license_number"]
        }
    )

    return DriverApplicationResponse(
        id=application["_id"],
        user_id=application["user_id"],
        user_name=current_user["name"],
        user_email=current_user["email"],
        user_phone=current_user.get("phone"),
        license_number=application["license_number"],
        years_of_experience=application["years_of_experience"],
        emergency_contact=application["emergency_contact"],
        notes=application.get("notes"),
        document_references=application.get("document_references", []),
        application_status=application["application_status"],
        created_at=application["created_at"],
        updated_at=application["updated_at"]
    )

@router.get("/manager/driver-applications", response_model=List[DriverApplicationResponse])
async def list_driver_applications(
    status: Optional[DriverApplicationStatus] = None,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    apps = await driver_app_repo.list_applications(status=status)
    results = []
    for a in apps:
        user = await user_repo.get_by_id(a["user_id"])
        results.append(DriverApplicationResponse(
            id=a["_id"],
            user_id=a["user_id"],
            user_name=user.get("name") if user else "Unknown",
            user_email=user.get("email") if user else "Unknown",
            user_phone=user.get("phone") if user else None,
            license_number=a["license_number"],
            years_of_experience=a["years_of_experience"],
            emergency_contact=a["emergency_contact"],
            notes=a.get("notes"),
            document_references=a.get("document_references", []),
            application_status=a["application_status"],
            reviewed_by=a.get("reviewed_by"),
            reviewed_at=a.get("reviewed_at"),
            review_notes=a.get("review_notes"),
            created_at=a["created_at"],
            updated_at=a["updated_at"]
        ))
    return results

@router.post("/manager/driver-applications/{app_id}/approve", response_model=DriverApplicationResponse)
async def approve_driver_application(
    app_id: str,
    review: DriverApplicationReview,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    app = await driver_app_repo.get_by_id(app_id)
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    updated_app = await driver_app_repo.review_application(
        application_id=app_id,
        status=DriverApplicationStatus.APPROVED,
        reviewed_by=current_user["_id"],
        review_notes=review.review_notes
    )

    # Elevate user to DRIVER role and ACTIVE status
    await user_repo.update_user(app["user_id"], {
        "role": UserRole.DRIVER.value,
        "account_status": AccountStatus.ACTIVE.value
    })

    # Create persistent notification for the approved driver
    d_notif = await notification_repo.create_notification(
        recipient_user_id=app["user_id"],
        notification_type=NotificationType.GENERAL,
        title="✅ Driver Application Approved",
        message="Congratulations! Your driver application has been reviewed and approved by the College Transport Manager. You can now log in and take scheduled duty trips.",
        related_entity_id=app_id
    )

    await ws_manager.broadcast_event(
        event_type="notification.created",
        payload={
            "id": d_notif["_id"],
            "recipient_user_id": app["user_id"],
            "title": d_notif["title"],
            "message": d_notif["message"],
            "notification_type": d_notif["notification_type"],
            "related_entity_id": app_id,
            "is_read": False,
            "created_at": d_notif["created_at"].isoformat()
        },
        recipient_user_id=app["user_id"]
    )

    await ws_manager.broadcast_event(
        event_type="driver_application.approved",
        payload={"application_id": app_id, "user_id": app["user_id"]},
        recipient_user_id=app["user_id"]
    )

    await audit_repo.log_action(
        action="approve_driver_application",
        user_id=current_user["_id"],
        entity_type="driver_application",
        entity_id=app_id,
        details={"driver_user_id": app["user_id"]}
    )

    user = await user_repo.get_by_id(app["user_id"])
    return DriverApplicationResponse(
        id=updated_app["_id"],
        user_id=updated_app["user_id"],
        user_name=user.get("name") if user else "Unknown",
        user_email=user.get("email") if user else "Unknown",
        user_phone=user.get("phone") if user else None,
        license_number=updated_app["license_number"],
        years_of_experience=updated_app["years_of_experience"],
        emergency_contact=updated_app["emergency_contact"],
        notes=updated_app.get("notes"),
        document_references=updated_app.get("document_references", []),
        application_status=updated_app["application_status"],
        reviewed_by=updated_app.get("reviewed_by"),
        reviewed_at=updated_app.get("reviewed_at"),
        review_notes=updated_app.get("review_notes"),
        created_at=updated_app["created_at"],
        updated_at=updated_app["updated_at"]
    )

@router.post("/manager/driver-applications/{app_id}/reject", response_model=DriverApplicationResponse)
async def reject_driver_application(
    app_id: str,
    review: DriverApplicationReview,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    app = await driver_app_repo.get_by_id(app_id)
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")

    updated_app = await driver_app_repo.review_application(
        application_id=app_id,
        status=DriverApplicationStatus.REJECTED,
        reviewed_by=current_user["_id"],
        review_notes=review.review_notes
    )

    await user_repo.update_user(app["user_id"], {
        "account_status": AccountStatus.REJECTED.value
    })

    await notification_repo.create_notification(
        recipient_user_id=app["user_id"],
        notification_type=NotificationType.GENERAL,
        title="Driver Application Update",
        message=f"Your driver application was not approved. Notes: {review.review_notes or 'Please contact transport manager.'}",
        related_entity_id=app_id
    )

    user = await user_repo.get_by_id(app["user_id"])
    return DriverApplicationResponse(
        id=updated_app["_id"],
        user_id=updated_app["user_id"],
        user_name=user.get("name") if user else "Unknown",
        user_email=user.get("email") if user else "Unknown",
        user_phone=user.get("phone") if user else None,
        license_number=updated_app["license_number"],
        years_of_experience=updated_app["years_of_experience"],
        emergency_contact=updated_app["emergency_contact"],
        notes=updated_app.get("notes"),
        document_references=updated_app.get("document_references", []),
        application_status=updated_app["application_status"],
        reviewed_by=updated_app.get("reviewed_by"),
        reviewed_at=updated_app.get("reviewed_at"),
        review_notes=updated_app.get("review_notes"),
        created_at=updated_app["created_at"],
        updated_at=updated_app["updated_at"]
    )
