import pytest
from httpx import AsyncClient
from datetime import datetime, timezone, timedelta

@pytest.mark.asyncio
async def test_manager_dashboard_and_ml_training(async_client: AsyncClient, manager_token: str):
    # 1. Dashboard metrics returns real numbers
    dash_res = await async_client.get(
        "/api/manager/dashboard",
        headers={"Authorization": f"Bearer {manager_token}"}
    )
    assert dash_res.status_code == 200
    metrics = dash_res.json()
    assert "total_buses" in metrics
    assert "active_trips" in metrics
    assert "approved_drivers" in metrics

    # 2. Train ML model
    train_res = await async_client.post(
        "/api/manager/ml/train",
        headers={"Authorization": f"Bearer {manager_token}"}
    )
    assert train_res.status_code == 200
    data = train_res.json()
    assert data["status"] == "success"
    assert "mae_seconds" in data["metrics"]
    assert data["metrics"]["mae_seconds"] >= 0.0

@pytest.mark.asyncio
async def test_gps_anomaly_and_stale_detection(async_client: AsyncClient, manager_token: str):
    # Setup Driver
    reg_res = await async_client.post("/api/auth/register", json={
        "email": "driver_anomaly@college.edu",
        "password": "Password@123",
        "name": "Anomaly Driver",
        "role": "driver",
        "license_number": "TN-67-2022-9999",
        "years_of_experience": 4
    })
    assert reg_res.status_code == 201

    apps_res = await async_client.get("/api/manager/driver-applications", headers={"Authorization": f"Bearer {manager_token}"})
    apps = apps_res.json()
    target_app = next(a for a in apps if a["license_number"] == "TN-67-2022-9999")
    approve_res = await async_client.post(
        f"/api/manager/driver-applications/{target_app['id']}/approve",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"status": "approved", "review_notes": "Verified"}
    )
    assert approve_res.status_code == 200

    login_res = await async_client.post("/api/auth/login", json={
        "email": "driver_anomaly@college.edu",
        "password": "Password@123",
        "role": "driver"
    })
    assert login_res.status_code == 200
    driver_token = login_res.json()["access_token"]
    driver_id = login_res.json()["user"]["id"]

    bus_res = await async_client.post(
        "/api/buses",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"bus_number": "BUS-ANOMALY", "capacity": 30}
    )
    bus_id = bus_res.json()["id"]

    s1 = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"name": "Stop Alpha", "latitude": 12.9000, "longitude": 77.5000}
    )
    s2 = await async_client.post(
        "/api/stops",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"name": "Stop Beta", "latitude": 12.9100, "longitude": 77.5100}
    )

    route_res = await async_client.post(
        "/api/routes",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"route_name": "Anomaly Test Route", "ordered_stop_ids": [s1.json()["id"], s2.json()["id"]]}
    )

    assign_res = await async_client.post(
        "/api/assignments",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={
            "bus_id": bus_id,
            "driver_id": driver_id,
            "route_id": route_res.json()["id"],
            "service_date": "2026-10-21",
            "scheduled_departure": "09:00"
        }
    )
    assign_id = assign_res.json()["id"]

    # Driver accepts & verifies arrival
    await async_client.post(f"/api/assignments/{assign_id}/accept", headers={"Authorization": f"Bearer {driver_token}"})
    await async_client.post(
        f"/api/assignments/{assign_id}/check-arrival",
        headers={"Authorization": f"Bearer {driver_token}"},
        json={"latitude": 12.90005, "longitude": 77.50005, "accuracy_meters": 5.0}
    )

    # Start Trip
    start = await async_client.post(f"/api/assignments/{assign_id}/start-trip", headers={"Authorization": f"Bearer {driver_token}"})
    trip_id = start.json()["trip_id"]

    # Point 1 at t0
    t0 = datetime.now(timezone.utc)
    await async_client.post(
        f"/api/trips/{trip_id}/locations",
        headers={"Authorization": f"Bearer {driver_token}"},
        json={"latitude": 12.9000, "longitude": 77.5000, "accuracy_meters": 5.0, "recorded_at": t0.isoformat(), "sequence_number": 1}
    )

    # Point 2 at t0 + 2 seconds, but 2 kilometers away (impossible jump > 3000 km/h)
    t1 = t0 + timedelta(seconds=2)
    jump_res = await async_client.post(
        f"/api/trips/{trip_id}/locations",
        headers={"Authorization": f"Bearer {driver_token}"},
        json={"latitude": 12.9200, "longitude": 77.5200, "accuracy_meters": 5.0, "recorded_at": t1.isoformat(), "sequence_number": 2}
    )
    assert jump_res.status_code == 200
    assert jump_res.json()["is_anomaly"] is True
    assert "jump detected" in jump_res.json()["warning"]
