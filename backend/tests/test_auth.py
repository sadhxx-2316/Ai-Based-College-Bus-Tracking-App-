import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_credential_login_flow(async_client: AsyncClient):
    # Register student
    reg_res = await async_client.post("/api/auth/register", json={
        "email": "test_direct_user@college.edu",
        "password": "SecurePassword123!",
        "name": "Test User",
        "role": "student"
    })
    assert reg_res.status_code == 201

    # Login with credentials
    login_res = await async_client.post("/api/auth/login", json={
        "email": "test_direct_user@college.edu",
        "password": "SecurePassword123!",
        "role": "student"
    })
    assert login_res.status_code == 200
    data = login_res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "test_direct_user@college.edu"
    assert data["user"]["role"] == "student"

@pytest.mark.asyncio
async def test_get_me(async_client: AsyncClient, manager_token: str):
    response = await async_client.get("/api/me", headers={"Authorization": f"Bearer {manager_token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "manager@college.edu"
    assert data["role"] == "bus_manager"

@pytest.mark.asyncio
async def test_unauthorized_access(async_client: AsyncClient):
    response = await async_client.get("/api/me")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_student_signup_and_login(async_client: AsyncClient):
    # Student registers and is active immediately
    reg_res = await async_client.post("/api/auth/register", json={
        "email": "fresh_student@college.edu",
        "password": "Password@123",
        "name": "Fresh Student",
        "role": "student",
        "roll_number": "22CS105",
        "department": "Computer Science & Engineering",
        "year": "2nd Year",
        "boarding_stop_id": "stop_test_123",
        "boarding_stop_name": "City Junction Terminal"
    })
    assert reg_res.status_code == 201
    user_data = reg_res.json()["user"]
    assert user_data["account_status"] == "active"
    assert user_data["roll_number"] == "22CS105"
    assert user_data["department"] == "Computer Science & Engineering"
    assert user_data["year"] == "2nd Year"
    assert user_data["boarding_stop_name"] == "City Junction Terminal"

    # Student logs in with password
    login_res = await async_client.post("/api/auth/login", json={
        "email": "fresh_student@college.edu",
        "password": "Password@123",
        "role": "student"
    })
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

@pytest.mark.asyncio
async def test_driver_signup_and_manager_verification(async_client: AsyncClient, manager_token: str):
    # 1. Driver signs up
    reg_res = await async_client.post("/api/auth/register", json={
        "email": "fresh_driver@college.edu",
        "password": "DriverPassword@123",
        "name": "Fresh Driver",
        "role": "driver",
        "license_number": "DL-998877",
        "years_of_experience": 5,
        "emergency_contact": "9998887776"
    })
    assert reg_res.status_code == 201
    assert reg_res.json()["user"]["account_status"] == "pending_review"

    # 2. Driver attempts login before manager approval (must be rejected)
    premature_login = await async_client.post("/api/auth/login", json={
        "email": "fresh_driver@college.edu",
        "password": "DriverPassword@123",
        "role": "driver"
    })
    assert premature_login.status_code == 403
    assert "PENDING verification by the College Transport Manager" in premature_login.json()["detail"]

    # 3. Manager views driver applications
    apps_res = await async_client.get(
        "/api/manager/driver-applications",
        headers={"Authorization": f"Bearer {manager_token}"}
    )
    assert apps_res.status_code == 200
    apps = apps_res.json()
    matching_app = next((a for a in apps if a["license_number"] == "DL-998877"), None)
    assert matching_app is not None

    # 4. Manager approves driver
    approve_res = await async_client.post(
        f"/api/manager/driver-applications/{matching_app['id']}/approve",
        headers={"Authorization": f"Bearer {manager_token}"},
        json={"status": "approved", "review_notes": "Verified license and experience"}
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["application_status"] == "approved"

    # 5. Driver logs in successfully after approval
    approved_login = await async_client.post("/api/auth/login", json={
        "email": "fresh_driver@college.edu",
        "password": "DriverPassword@123",
        "role": "driver"
    })
    assert approved_login.status_code == 200
    assert approved_login.json()["user"]["account_status"] == "active"

@pytest.mark.asyncio
async def test_manager_signup_and_admin_verification(async_client: AsyncClient, admin_token: str):
    # 1. Transport Manager signs up
    reg_res = await async_client.post("/api/auth/register", json={
        "email": "new_manager@college.edu",
        "password": "ManagerPassword@123",
        "name": "New Manager",
        "role": "bus_manager",
        "employee_id": "EMP-8821",
        "department": "Campus Logistics"
    })
    assert reg_res.status_code == 201
    manager_id = reg_res.json()["user"]["id"]
    assert reg_res.json()["user"]["account_status"] == "pending_review"

    # 2. Manager attempts login before admin approval (must be rejected)
    premature_login = await async_client.post("/api/auth/login", json={
        "email": "new_manager@college.edu",
        "password": "ManagerPassword@123",
        "role": "bus_manager"
    })
    assert premature_login.status_code == 403
    assert "PENDING verification by the System Administrator" in premature_login.json()["detail"]

    # 3. Admin lists managers
    admin_list = await async_client.get(
        "/api/admin/managers?status=pending_review",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert admin_list.status_code == 200
    managers = admin_list.json()
    assert any(m["id"] == manager_id for m in managers)

    # 4. Admin approves manager
    approve_res = await async_client.post(
        f"/api/admin/managers/{manager_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"action": "approve", "notes": "Approved for Campus Logistics"}
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["account_status"] == "active"

    # 5. Manager logs in successfully after admin approval
    approved_login = await async_client.post("/api/auth/login", json={
        "email": "new_manager@college.edu",
        "password": "ManagerPassword@123",
        "role": "bus_manager"
    })
    assert approved_login.status_code == 200
    assert approved_login.json()["user"]["account_status"] == "active"
