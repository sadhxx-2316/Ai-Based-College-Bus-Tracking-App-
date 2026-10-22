import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_bus_crud_and_duplicate_prevention(async_client: AsyncClient, manager_token: str, student_token: str):
    # 1. Student cannot create bus
    forbidden_res = await async_client.post(
        "/api/buses",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"bus_number": "BUS-101", "capacity": 45}
    )
    assert forbidden_res.status_code == 403

    # 2. Manager creates bus
    create_res = await async_client.post(
        "/api/buses",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"bus_number": "BUS-101", "capacity": 45, "registration_number": "KA-01-AB-1234"}
    )
    assert create_res.status_code == 201
    bus_data = create_res.json()
    assert bus_data["bus_number"] == "BUS-101"
    assert bus_data["capacity"] == 45
    bus_id = bus_data["id"]

    # 3. Duplicate bus number rejected
    dup_res = await async_client.post(
        "/api/buses",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"bus_number": "BUS-101", "capacity": 50}
    )
    assert dup_res.status_code == 400

    # 4. List buses
    list_res = await async_client.get("/api/buses", headers={"Authorization": f"Bearer {manager_token}"})
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

@pytest.mark.asyncio
async def test_stops_and_route_creation(async_client: AsyncClient, manager_token: str):
    # 1. Create Stops
    stop1 = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"name": "Campus Main Gate", "latitude": 12.9716, "longitude": 77.5946}
    )
    assert stop1.status_code == 201
    s1_id = stop1.json()["id"]

    stop2 = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"name": "Metro Station", "latitude": 12.9800, "longitude": 77.6000}
    )
    assert stop2.status_code == 201
    s2_id = stop2.json()["id"]

    stop3 = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"name": "City Center Terminal", "latitude": 12.9900, "longitude": 77.6100}
    )
    assert stop3.status_code == 201
    s3_id = stop3.json()["id"]

    # 2. Preview Route
    preview_res = await async_client.post(
        "/api/routes/preview",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"ordered_stop_ids": [s1_id, s2_id, s3_id]}
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    assert "route_geometry" in preview_data
    assert preview_data["distance_meters"] > 0
    assert len(preview_data["stops"]) == 3

    # 3. Create Route
    route_res = await async_client.post(
        "/api/routes",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={
            "route_name": "Route 1 - Metro Express",
            "ordered_stop_ids": [s1_id, s2_id, s3_id]
        }
    )
    assert route_res.status_code == 201
    route_data = route_res.json()
    assert route_data["route_name"] == "Route 1 - Metro Express"
    assert route_data["origin_stop_id"] == s1_id
    assert route_data["destination_stop_id"] == s3_id

@pytest.mark.asyncio
async def test_student_fleet_endpoint(async_client, manager_token, student_token):
    # 1. Create a bus first as manager
    await async_client.post(
        "/api/buses",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"bus_number": "BUS-99", "capacity": 40, "registration_number": "TN-99-9999"}
    )

    # 2. Query fleet as student
    res = await async_client.get(
        "/api/student/fleet",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res.status_code == 200
    fleet = res.json()
    assert isinstance(fleet, list)
    assert len(fleet) >= 1
    bus_item = fleet[0]
    assert "bus_id" in bus_item
    assert "bus_number" in bus_item
    assert "route_name" in bus_item
    assert "scheduled_departure" in bus_item
    assert "trip_status" in bus_item
    assert "stops" in bus_item

@pytest.mark.asyncio
async def test_delete_stop_and_route(async_client, manager_token, student_token):
    # 1. Create a test stop
    stop_res = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={
            "name": "Deletable Stop",
            "latitude": 12.9200,
            "longitude": 80.1200,
            "address": "Temporary Spot"
        }
    )
    assert stop_res.status_code == 201
    stop_id = stop_res.json()["id"]

    # 2. Student cannot delete stop (role check)
    student_del_res = await async_client.delete(
        f"/api/stops/{stop_id}",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert student_del_res.status_code == 403

    # 3. Manager can delete stop
    mgr_del_res = await async_client.delete(
        f"/api/stops/{stop_id}",
        headers={"Authorization": f"Bearer {manager_token}"}
    )
    assert mgr_del_res.status_code == 200
    assert mgr_del_res.json()["stop_id"] == stop_id

    # 4. Create a test route
    s1_res = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"name": "Temp S1", "latitude": 12.90, "longitude": 80.10}
    )
    s2_res = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"name": "Temp S2", "latitude": 12.91, "longitude": 80.11}
    )
    s1_id = s1_res.json()["id"]
    s2_id = s2_res.json()["id"]

    route_res = await async_client.post(
        "/api/routes",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={
            "route_name": "Temporary Route For Deletion",
            "ordered_stop_ids": [s1_id, s2_id]
        }
    )
    assert route_res.status_code == 201
    route_id = route_res.json()["id"]

    # 5. Student cannot delete route
    student_route_del = await async_client.delete(
        f"/api/routes/{route_id}",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert student_route_del.status_code == 403

    # 6. Manager can delete route
    mgr_route_del = await async_client.delete(
        f"/api/routes/{route_id}",
        headers={"Authorization": f"Bearer {manager_token}"}
    )
    assert mgr_route_del.status_code == 200
    assert mgr_route_del.json()["route_id"] == route_id

    # 7. Clean up stops
    await async_client.delete(f"/api/stops/{s1_id}", headers={"Authorization": f"Bearer {manager_token}"})
    await async_client.delete(f"/api/stops/{s2_id}", headers={"Authorization": f"Bearer {manager_token}"})

