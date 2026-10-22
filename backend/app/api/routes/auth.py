from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from app.services.auth_service import get_current_user, create_access_token
from app.repositories.user_repo import user_repo, verify_password, get_password_hash
from app.repositories.driver_application_repo import driver_app_repo
from app.repositories.notification_repo import notification_repo
from app.schemas.user import (
    UserResponse,
    UserRegisterRequest,
    UserLoginRequest,
    TokenResponse
)
from app.schemas.notification import NotificationResponse, NotificationMarkReadResponse
from app.schemas.enums import UserRole, AccountStatus, NotificationType
from app.websocket.connection_manager import ws_manager

router = APIRouter(prefix="", tags=["Authentication & Profile"])

def build_user_response(user: Dict[str, Any]) -> UserResponse:
    return UserResponse(
        id=user["_id"],
        firebase_uid=user["firebase_uid"],
        email=user["email"],
        name=user["name"],
        phone=user.get("phone"),
        role=user["role"],
        account_status=user["account_status"],
        employee_id=user.get("employee_id"),
        department=user.get("department"),
        license_number=user.get("license_number"),
        roll_number=user.get("roll_number"),
        year=user.get("year"),
        boarding_stop_id=user.get("boarding_stop_id"),
        boarding_stop_name=user.get("boarding_stop_name"),
        created_at=user["created_at"],
        updated_at=user["updated_at"]
    )

@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    return build_user_response(current_user)

@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_user(req: UserRegisterRequest):
    """
    Registers a new Student, Driver, or Bus Manager account.
    - Students are active immediately.
    - Drivers are set to PENDING_REVIEW; College Transport Manager must verify and approve them.
    - Bus Managers are set to PENDING_REVIEW; System Admin must verify and approve them.
    """
    existing = await user_repo.get_by_email(req.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{req.email}' is already registered."
        )

    # Disallow direct self-registration as admin
    if req.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator accounts cannot be created via public registration."
        )

    # Initial status based on role
    initial_status = AccountStatus.ACTIVE
    extra_fields = {}
    message = "Account created successfully."

    if req.role == UserRole.STUDENT:
        initial_status = AccountStatus.ACTIVE
        extra_fields = {
            "roll_number": req.roll_number,
            "department": req.department,
            "year": req.year,
            "boarding_stop_id": req.boarding_stop_id,
            "boarding_stop_name": req.boarding_stop_name
        }
        message = "Student account created successfully! You now have active access to live bus tracking."

    elif req.role == UserRole.DRIVER:
        initial_status = AccountStatus.PENDING_REVIEW
        extra_fields = {
            "license_number": req.license_number,
            "years_of_experience": req.years_of_experience or 0,
            "emergency_contact": req.emergency_contact
        }
        message = "Driver account registered! Your account is pending verification and approval by the College Transport Manager."

    elif req.role == UserRole.BUS_MANAGER:
        initial_status = AccountStatus.PENDING_REVIEW
        extra_fields = {
            "employee_id": req.employee_id,
            "department": req.department or "Transport Management"
        }
        message = "Transport Manager account registered! Your account is pending verification and approval by the System Administrator."

    # Hash password
    pwd_hash = get_password_hash(req.password)
    user_uid = f"local_{req.role.value}_{req.email.lower()}"

    user = await user_repo.create_user(
        firebase_uid=user_uid,
        email=req.email,
        name=req.name,
        role=req.role,
        account_status=initial_status,
        phone=req.phone,
        password_hash=pwd_hash,
        extra_fields=extra_fields
    )

    # If driver, create formal driver application record for manager dashboard & send notification
    if req.role == UserRole.DRIVER:
        app_doc = await driver_app_repo.create_application(
            user_id=user["_id"],
            license_number=req.license_number or "PENDING",
            years_of_experience=req.years_of_experience or 0,
            emergency_contact=req.emergency_contact or req.phone or "N/A",
            notes="Submitted via driver registration form"
        )

        # Create persistent notification for all Bus Managers
        managers = await user_repo.list_users(role=UserRole.BUS_MANAGER)
        for mgr in managers:
            notif = await notification_repo.create_notification(
                recipient_user_id=mgr["_id"],
                notification_type=NotificationType.GENERAL,
                title="New Driver Application",
                message=f"Driver application received from {req.name} ({req.email}). License: {req.license_number or 'Pending'}, Experience: {req.years_of_experience or 0} yrs. Please review in Drivers tab.",
                related_entity_id=app_doc["_id"]
            )
            await ws_manager.broadcast_event(
                event_type="notification.created",
                payload={
                    "id": notif["_id"],
                    "recipient_user_id": mgr["_id"],
                    "title": notif["title"],
                    "message": notif["message"],
                    "notification_type": notif["notification_type"],
                    "related_entity_id": app_doc["_id"],
                    "is_read": False,
                    "created_at": notif["created_at"].isoformat()
                },
                recipient_user_id=mgr["_id"]
            )

        # Notify Managers via WebSocket
        await ws_manager.broadcast_event(
            event_type="driver_application.submitted",
            payload={
                "application_id": app_doc["_id"],
                "user_id": user["_id"],
                "name": user["name"],
                "email": user["email"],
                "license_number": req.license_number
            }
        )

    # If manager, notify System Admin via WebSocket
    if req.role == UserRole.BUS_MANAGER:
        await ws_manager.broadcast_event(
            event_type="manager_application.submitted",
            payload={
                "user_id": user["_id"],
                "name": user["name"],
                "email": user["email"],
                "employee_id": req.employee_id
            }
        )

    # Generate token (valid for students immediately; for pending accounts token is returned for session display)
    token = create_access_token({
        "sub": user["_id"],
        "uid": user["firebase_uid"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"]
    })

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        message=message,
        user=build_user_response(user)
    )

@router.post("/auth/login", response_model=TokenResponse)
async def login_user(req: UserLoginRequest):
    """
    Standard email and password login.
    Enforces role verification and approval checks:
    - Rejects pending drivers (must be verified by manager)
    - Rejects pending managers (must be verified by admin)
    """
    user = await user_repo.get_by_email(req.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    # Verify password if hashed
    if user.get("password_hash"):
        if not verify_password(req.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password."
            )

    # If specific role was targeted, check role match
    if req.role and user.get("role") != req.role.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This account is registered as a {user.get('role')}, not a {req.role.value}. Please select the correct role."
        )

    # Check account approval status
    account_status = user.get("account_status", AccountStatus.ACTIVE.value)
    if account_status == AccountStatus.PENDING_REVIEW.value:
        if user.get("role") == UserRole.DRIVER.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your driver account is currently PENDING verification by the College Transport Manager. Please wait for approval before logging in."
            )
        elif user.get("role") == UserRole.BUS_MANAGER.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your Transport Manager account is currently PENDING verification by the System Administrator. Please wait for approval before logging in."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is pending administrative approval."
            )
    elif account_status == AccountStatus.REJECTED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account registration was reviewed and rejected. Please contact college administration."
        )
    elif account_status == AccountStatus.SUSPENDED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended. Please contact the administrator."
        )

    token = create_access_token({
        "sub": user["_id"],
        "uid": user["firebase_uid"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"]
    })

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        message="Sign in successful.",
        user=build_user_response(user)
    )


@router.post("/auth/sync-firebase", response_model=TokenResponse)
async def sync_firebase_user(current_user: Dict[str, Any] = Depends(get_current_user)):
    token = create_access_token({
        "sub": current_user["_id"],
        "uid": current_user["firebase_uid"],
        "email": current_user["email"],
        "name": current_user["name"],
        "role": current_user["role"]
    })
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=build_user_response(current_user)
    )

@router.get("/me/notifications", response_model=List[NotificationResponse])
async def get_my_notifications(current_user: Dict[str, Any] = Depends(get_current_user)):
    notifs = await notification_repo.list_notifications(current_user["_id"])
    return [
        NotificationResponse(
            id=n["_id"],
            recipient_user_id=n["recipient_user_id"],
            notification_type=n["notification_type"],
            title=n["title"],
            message=n["message"],
            related_entity_id=n.get("related_entity_id"),
            is_read=n["is_read"],
            created_at=n["created_at"],
            read_at=n.get("read_at")
        ) for n in notifs
    ]

@router.patch("/me/notifications/{notification_id}/read", response_model=NotificationMarkReadResponse)
async def mark_notification_as_read(notification_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    updated = await notification_repo.mark_as_read(notification_id, current_user["_id"])
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    return NotificationMarkReadResponse(
        id=updated["_id"],
        is_read=updated["is_read"],
        read_at=updated["read_at"]
    )
