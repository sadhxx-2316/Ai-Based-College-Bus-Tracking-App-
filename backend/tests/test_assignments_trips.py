import pytest
from httpx import AsyncClient
from datetime import datetime, timezone

@pytest.mark.asyncio
async def test_full_assignment_and_trip_lifecycle(async_client: AsyncClient, manager_token: str):
    # 1. Setup Driver via real registration and manager approval
    reg_res = await async_client.post("/api/auth/register", json={
        "email": "driver_dave@college.edu",
        "password": "Password@123",
        "name": "Dave Driver",
        "role": "driver",
        "license_number": "TN-67-2022-0099",
        "years_of_experience": 5
    })
    assert reg_res.status_code == 201

    # Manager approves driver application
    apps_res = await async_client.get("/api/manager/driver-applications", headers={"Authorization": f"Bearer {manager_token}"})
    apps = apps_res.json()
    target_app = next(a for a in apps if a["license_number"] == "TN-67-2022-0099")
    approve_res = await async_client.post(
        f"/api/manager/driver-applications/{target_app['id']}/approve",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"status": "approved", "review_notes": "Verified license"}
    )
    assert approve_res.status_code == 200

    # Driver logs in
    login_res = await async_client.post("/api/auth/login", json={
        "email": "driver_dave@college.edu",
        "password": "Password@123",
        "role": "driver"
    })
    assert login_res.status_code == 200
    driver_data = login_res.json()
    driver_token = driver_data["access_token"]
    driver_id = driver_data["user"]["id"]

    # 2. Setup Bus
    bus_res = await async_client.post(
        "/api/buses",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"bus_number": "BUS-99", "capacity": 40}
    )
    bus_id = bus_res.json()["id"]

    # 3. Setup Stops and Route
    s1 = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"name": "Hostel Block A", "latitude": 13.0000, "longitude": 80.0000}
    )
    s1_id = s1.json()["id"]

    s2 = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"name": "College Main Building", "latitude": 13.0080, "longitude": 80.0080}
    )
    s2_id = s2.json()["id"]

    route_res = await async_client.post(
        "/api/routes",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"route_name": "Hostel Shuttle", "ordered_stop_ids": [s1_id, s2_id]}
    )
    route_id = route_res.json()["id"]

    # 4. Create Assignment
    assign_res = await async_client.post(
        "/api/assignments",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={
            "bus_id": bus_id,
            "driver_id": driver_id,
            "route_id": route_id,
            "service_date": "2026-10-20",
            "scheduled_departure": "08:00"
        }
    )
    assert assign_res.status_code == 201
    assign_data = assign_res.json()
    assign_id = assign_data["id"]
    assert assign_data["assignment_status"] == "pending"

    # 5. Conflict Check - Attempt to assign same bus at same date/time
    conflict_res = await async_client.post(
        "/api/assignments",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={
            "bus_id": bus_id,
            "driver_id": driver_id,
            "route_id": route_id,
            "service_date": "2026-10-20",
            "scheduled_departure": "08:00"
        }
    )
    assert conflict_res.status_code == 409

    # 6. Driver accepts assignment
    accept_res = await async_client.post(
        f"/api/assignments/{assign_id}/accept",
        headers={"Authorization": f"Bearer {driver_token}"}
    )
    assert accept_res.status_code == 200
    assert accept_res.json()["assignment_status"] == "accepted"

    # 7. Driver Arrival Check - Far away (should fail)
    far_arrival = await async_client.post(
        f"/api/assignments/{assign_id}/check-arrival",
        headers={"Authorization": f"Bearer {driver_token}"},
        json={"latitude": 13.0500, "longitude": 80.0500, "accuracy_meters": 10.0}
    )
    assert far_arrival.status_code == 200
    assert far_arrival.json()["verified"] is False

    # 8. Driver attempts Start Trip before arrival verified (should fail)
    premature_start = await async_client.post(
        f"/api/assignments/{assign_id}/start-trip",
        headers={"Authorization": f"Bearer {driver_token}"}
    )
    assert premature_start.status_code == 400

    # 9. Driver Arrival Check - Close to origin stop (13.0000, 80.0000)
    close_arrival = await async_client.post(
        f"/api/assignments/{assign_id}/check-arrival",
        headers={"Authorization": f"Bearer {driver_token}"},
        json={"latitude": 13.0001, "longitude": 80.0001, "accuracy_meters": 8.0}
    )
    assert close_arrival.status_code == 200
    assert close_arrival.json()["verified"] is True
    assert close_arrival.json()["distance_to_start_meters"] < 100.0

    # 10. Start Trip
    start_res = await async_client.post(
        f"/api/assignments/{assign_id}/start-trip",
        headers={"Authorization": f"Bearer {driver_token}"}
    )
    assert start_res.status_code == 200
    trip_id = start_res.json()["trip_id"]
    assert start_res.json()["trip_status"] == "active"

    # 11. Prevent Duplicate Start
    dup_start = await async_client.post(
        f"/api/assignments/{assign_id}/start-trip",
        headers={"Authorization": f"Bearer {driver_token}"}
    )
    assert dup_start.status_code == 400

    # 12. Submit GPS Observation
    now_iso = datetime.now(timezone.utc).isoformat()
    gps_res = await async_client.post(
        f"/api/trips/{trip_id}/locations",
        headers={"Authorization": f"Bearer {driver_token}"},
        json={
            "latitude": 13.0020,
            "longitude": 80.0020,
            "accuracy_meters": 12.0,
            "recorded_at": now_iso,
            "sequence_number": 1
        }
    )
    assert gps_res.status_code == 200
    assert gps_res.json()["success"] is True

    # 13. Query Student ETA for Stop 2
    eta_res = await async_client.get(
        f"/api/trips/{trip_id}/eta?stop_id={s2_id}",
        headers={"Authorization": f"Bearer {driver_token}"}
    )
    assert eta_res.status_code == 200
    eta_data = eta_res.json()
    assert eta_data["is_available"] is True
    assert eta_data["eta_seconds"] is not None
    assert eta_data["distance_remaining_meters"] > 0

    # 14. End Trip
    end_res = await async_client.post(
        f"/api/trips/{trip_id}/end",
        headers={"Authorization": f"Bearer {driver_token}"}
    )
    assert end_res.status_code == 200
    assert end_res.json()["trip_status"] == "completed"

    # 15. Attempt to submit GPS after trip completed (must be rejected)
    late_gps = await async_client.post(
        f"/api/trips/{trip_id}/locations",
        headers={"Authorization": f"Bearer {driver_token}"},
        json={
            "latitude": 13.0080,
            "longitude": 80.0080,
            "accuracy_meters": 10.0,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "sequence_number": 2
        }
    )
    assert late_gps.status_code == 400
