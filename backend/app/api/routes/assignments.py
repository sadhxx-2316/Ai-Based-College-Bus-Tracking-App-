from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
from app.services.auth_service import get_current_user, require_roles
from app.schemas.enums import UserRole, AssignmentStatus, BusStatus, AccountStatus, NotificationType
from app.schemas.assignment import AssignmentCreate, AssignmentRejectRequest, AssignmentCancelRequest, AssignmentResponse
from app.schemas.bus import BusResponse
from app.schemas.route import RouteResponse
from app.repositories.assignment_repo import assignment_repo
from app.repositories.bus_repo import bus_repo
from app.repositories.user_repo import user_repo
from app.repositories.route_repo import route_repo
from app.repositories.notification_repo import notification_repo
from app.repositories.trip_repo import trip_repo
from app.repositories.audit_repo import audit_repo
from app.websocket.connection_manager import ws_manager

router = APIRouter(prefix="", tags=["Driver Assignments"])

async def enrich_assignment(a: Dict[str, Any]) -> AssignmentResponse:
    bus_doc = await bus_repo.get_by_id(a["bus_id"])
    route_doc = await route_repo.get_by_id(a["route_id"])
    driver_doc = await user_repo.get_by_id(a["driver_id"])

    bus_res = None
    if bus_doc:
        bus_res = BusResponse(
            id=bus_doc["_id"],
            bus_number=bus_doc["bus_number"],
            registration_number=bus_doc.get("registration_number"),
            capacity=bus_doc["capacity"],
            operational_status=bus_doc["operational_status"],
            created_at=bus_doc["created_at"],
            updated_at=bus_doc["updated_at"]
        )

    route_res = None
    if route_doc:
        route_res = RouteResponse(
            id=route_doc["_id"],
            route_name=route_doc["route_name"],
            description=route_doc.get("description"),
            origin_stop_id=route_doc["origin_stop_id"],
            destination_stop_id=route_doc["destination_stop_id"],
            ordered_stop_ids=route_doc["ordered_stop_ids"],
            route_geometry=route_doc["route_geometry"],
            distance_meters=route_doc["distance_meters"],
            estimated_travel_seconds=route_doc["estimated_travel_seconds"],
            route_status=route_doc["route_status"],
            created_at=route_doc["created_at"],
            updated_at=route_doc["updated_at"]
        )

    return AssignmentResponse(
        id=a["_id"],
        bus_id=a["bus_id"],
        driver_id=a["driver_id"],
        route_id=a["route_id"],
        service_date=a["service_date"],
        scheduled_departure=a["scheduled_departure"],
        scheduled_end=a.get("scheduled_end"),
        assignment_status=a["assignment_status"],
        assigned_by=a.get("assigned_by"),
        assigned_at=a["assigned_at"],
        responded_at=a.get("responded_at"),
        cancellation_reason=a.get("cancellation_reason"),
        bus=bus_res,
        route=route_res,
        driver_name=driver_doc.get("name") if driver_doc else "Unknown Driver",
        created_at=a["created_at"],
        updated_at=a["updated_at"]
    )

@router.post("/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    assign_in: AssignmentCreate,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    # 1. Validate Bus
    bus = await bus_repo.get_by_id(assign_in.bus_id)
    if not bus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified bus does not exist.")
    if bus["operational_status"] != BusStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Bus '{bus['bus_number']}' is not active (status: {bus['operational_status']}).")

    # 2. Validate Driver
    driver = await user_repo.get_by_id(assign_in.driver_id)
    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified driver does not exist.")
    if driver["role"] != UserRole.DRIVER.value or driver["account_status"] != AccountStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User '{driver['name']}' is not an active approved driver.")

    # 3. Validate Route
    route = await route_repo.get_by_id(assign_in.route_id)
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified route does not exist.")
    if route.get("route_status") != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Route is inactive.")

    # 4. Check for assignment conflicts (same bus or driver at same date/time)
    conflict = await assignment_repo.find_conflict(
        service_date=assign_in.service_date,
        scheduled_departure=assign_in.scheduled_departure,
        bus_id=assign_in.bus_id,
        driver_id=assign_in.driver_id
    )
    if conflict:
        entity_conflicted = "Bus" if conflict["bus_id"] == assign_in.bus_id else "Driver"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{entity_conflicted} already has an active or pending assignment on {assign_in.service_date} at {assign_in.scheduled_departure}."
        )

    # 5. Create Assignment
    assignment = await assignment_repo.create_assignment(
        bus_id=assign_in.bus_id,
        driver_id=assign_in.driver_id,
        route_id=assign_in.route_id,
        service_date=assign_in.service_date,
        scheduled_departure=assign_in.scheduled_departure,
        scheduled_end=assign_in.scheduled_end,
        assigned_by=current_user["_id"]
    )

    # 6. Pre-create scheduled trip record
    await trip_repo.create_or_get_scheduled_trip(
        assignment_id=assignment["_id"],
        bus_id=assign_in.bus_id,
        driver_id=assign_in.driver_id,
        route_id=assign_in.route_id
    )

    # 7. Create persistent in-app notification for the driver
    driver_notif = await notification_repo.create_notification(
        recipient_user_id=assign_in.driver_id,
        notification_type=NotificationType.ASSIGNMENT_CREATED,
        title="📋 New Bus Assignment",
        message=f"You have been assigned Bus {bus['bus_number']} for route '{route['route_name']}' on {assign_in.service_date} at {assign_in.scheduled_departure}.",
        related_entity_id=assignment["_id"]
    )

    # 8. Broadcast real-time event directly to driver
    await ws_manager.broadcast_event(
        event_type="notification.created",
        payload={
            "id": driver_notif["_id"],
            "recipient_user_id": assign_in.driver_id,
            "title": driver_notif["title"],
            "message": driver_notif["message"],
            "notification_type": driver_notif["notification_type"],
            "related_entity_id": assignment["_id"],
            "is_read": False,
            "created_at": driver_notif["created_at"].isoformat()
        },
        recipient_user_id=assign_in.driver_id
    )

    await ws_manager.broadcast_event(
        event_type="assignment.created",
        payload={
            "assignment_id": assignment["_id"],
            "bus_number": bus["bus_number"],
            "route_name": route["route_name"],
            "service_date": assign_in.service_date,
            "scheduled_departure": assign_in.scheduled_departure,
            "driver_id": assign_in.driver_id
        },
        recipient_user_id=assign_in.driver_id
    )

    await audit_repo.log_action(
        action="create_assignment",
        user_id=current_user["_id"],
        entity_type="assignment",
        entity_id=assignment["_id"],
        details={"bus_id": assign_in.bus_id, "driver_id": assign_in.driver_id, "route_id": assign_in.route_id}
    )

    return await enrich_assignment(assignment)

@router.get("/assignments", response_model=List[AssignmentResponse])
async def list_all_assignments(
    service_date: Optional[str] = None,
    status: Optional[AssignmentStatus] = None,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    assignments = await assignment_repo.list_assignments(service_date=service_date, status=status)
    return [await enrich_assignment(a) for a in assignments]

@router.get("/driver/assignments", response_model=List[AssignmentResponse])
async def list_driver_assignments(
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.DRIVER]))
):
    assignments = await assignment_repo.list_assignments(driver_id=current_user["_id"])
    return [await enrich_assignment(a) for a in assignments]

@router.post("/assignments/{assignment_id}/accept", response_model=AssignmentResponse)
async def accept_assignment(
    assignment_id: str,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.DRIVER]))
):
    assignment = await assignment_repo.get_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")

    if assignment["driver_id"] != current_user["_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only accept assignments designated to you.")

    if assignment["assignment_status"] != AssignmentStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot accept assignment with status '{assignment['assignment_status']}'."
        )

    updated = await assignment_repo.respond_to_assignment(
        assignment_id=assignment_id,
        driver_id=current_user["_id"],
        status=AssignmentStatus.ACCEPTED
    )

    bus_doc = await bus_repo.get_by_id(assignment["bus_id"])
    bus_num = bus_doc["bus_number"] if bus_doc else "Bus"
    route_doc = await route_repo.get_by_id(assignment["route_id"])
    r_name = route_doc["route_name"] if route_doc else "Assigned Route"

    # Notify all Transport Managers
    managers = await user_repo.list_users(role=UserRole.BUS_MANAGER)
    for mgr in managers:
        m_notif = await notification_repo.create_notification(
            recipient_user_id=mgr["_id"],
            notification_type=NotificationType.GENERAL,
            title="✅ Driver Accepted Assignment",
            message=f"Driver {current_user['name']} has accepted the trip assignment for {bus_num} on '{r_name}'.",
            related_entity_id=assignment_id
        )
        await ws_manager.broadcast_event(
            event_type="notification.created",
            payload={
                "id": m_notif["_id"],
                "recipient_user_id": mgr["_id"],
                "title": m_notif["title"],
                "message": m_notif["message"],
                "notification_type": m_notif["notification_type"],
                "related_entity_id": assignment_id,
                "is_read": False,
                "created_at": m_notif["created_at"].isoformat()
            },
            recipient_user_id=mgr["_id"]
        )

    await ws_manager.broadcast_event(
        event_type="assignment.accepted",
        payload={
            "assignment_id": assignment_id,
            "driver_name": current_user["name"],
            "driver_id": current_user["_id"]
        },
        manager_only=True
    )

    await audit_repo.log_action(
        action="accept_assignment",
        user_id=current_user["_id"],
        entity_type="assignment",
        entity_id=assignment_id
    )

    return await enrich_assignment(updated)

@router.post("/assignments/{assignment_id}/reject", response_model=AssignmentResponse)
async def reject_assignment(
    assignment_id: str,
    req: AssignmentRejectRequest,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.DRIVER]))
):
    assignment = await assignment_repo.get_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")

    if assignment["driver_id"] != current_user["_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only reject assignments designated to you.")

    if assignment["assignment_status"] != AssignmentStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject assignment with status '{assignment['assignment_status']}'."
        )

    updated = await assignment_repo.respond_to_assignment(
        assignment_id=assignment_id,
        driver_id=current_user["_id"],
        status=AssignmentStatus.REJECTED,
        cancellation_reason=req.reason
    )

    bus_doc = await bus_repo.get_by_id(assignment["bus_id"])
    bus_num = bus_doc["bus_number"] if bus_doc else "Bus"
    route_doc = await route_repo.get_by_id(assignment["route_id"])
    r_name = route_doc["route_name"] if route_doc else "Assigned Route"

    # Notify all Transport Managers
    managers = await user_repo.list_users(role=UserRole.BUS_MANAGER)
    for mgr in managers:
        m_notif = await notification_repo.create_notification(
            recipient_user_id=mgr["_id"],
            notification_type=NotificationType.GENERAL,
            title="❌ Driver Declined Assignment",
            message=f"Driver {current_user['name']} declined assignment for {bus_num} on '{r_name}'. Reason: {req.reason or 'Not specified'}.",
            related_entity_id=assignment_id
        )
        await ws_manager.broadcast_event(
            event_type="notification.created",
            payload={
                "id": m_notif["_id"],
                "recipient_user_id": mgr["_id"],
                "title": m_notif["title"],
                "message": m_notif["message"],
                "notification_type": m_notif["notification_type"],
                "related_entity_id": assignment_id,
                "is_read": False,
                "created_at": m_notif["created_at"].isoformat()
            },
            recipient_user_id=mgr["_id"]
        )

    await ws_manager.broadcast_event(
        event_type="assignment.rejected",
        payload={
            "assignment_id": assignment_id,
            "driver_name": current_user["name"],
            "driver_id": current_user["_id"],
            "reason": req.reason
        },
        manager_only=True
    )

    await audit_repo.log_action(
        action="reject_assignment",
        user_id=current_user["_id"],
        entity_type="assignment",
        entity_id=assignment_id,
        details={"reason": req.reason}
    )

    return await enrich_assignment(updated)

@router.post("/assignments/{assignment_id}/cancel", response_model=AssignmentResponse)
async def cancel_assignment(
    assignment_id: str,
    req: AssignmentCancelRequest,
    current_user: Dict[str, Any] = Depends(require_roles([UserRole.BUS_MANAGER]))
):
    assignment = await assignment_repo.get_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")

    updated = await assignment_repo.cancel_assignment(assignment_id, reason=req.reason)
    if not updated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignment cannot be cancelled in its current state.")

    # Notify driver
    await notification_repo.create_notification(
        recipient_user_id=assignment["driver_id"],
        notification_type=NotificationType.ASSIGNMENT_CANCELLED,
        title="Assignment Cancelled",
        message=f"Your assignment for {assignment['service_date']} has been cancelled. Reason: {req.reason or 'Administrative update'}.",
        related_entity_id=assignment_id
    )

    await ws_manager.broadcast_event(
        event_type="assignment.cancelled",
        payload={"assignment_id": assignment_id, "reason": req.reason},
        recipient_user_id=assignment["driver_id"]
    )

    return await enrich_assignment(updated)
