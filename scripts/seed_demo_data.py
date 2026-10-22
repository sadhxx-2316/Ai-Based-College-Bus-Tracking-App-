"""
Development and Initial Setup Script
Provisions:
1. Super Admin account: admin@college.edu (Password: Admin@123)
2. Verified Transport Manager account: manager@college.edu (Password: Manager@123)
3. Verified Bus Driver account: driver.kumar@college.edu (Password: Driver@123)
4. Active Student account: student.ananya@college.edu (Password: Student@123)
5. Test Fleet Buses, Stops, Route and Initial Assignment
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

# Add backend directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.db.mongodb import connect_to_mongo, close_mongo_connection, get_database
from app.repositories.user_repo import user_repo, get_password_hash
from app.repositories.bus_repo import bus_repo
from app.repositories.stop_repo import stop_repo
from app.repositories.route_repo import route_repo
from app.repositories.driver_application_repo import driver_app_repo
from app.repositories.assignment_repo import assignment_repo
from app.repositories.trip_repo import trip_repo
from app.services.geo_service import compute_road_route
from app.schemas.enums import UserRole, AccountStatus, BusStatus, DriverApplicationStatus, AssignmentStatus

async def main():
    print("Connecting to MongoDB...")
    await connect_to_mongo()
    db = get_database()

    print("\n--- 1. Provisioning Dedicated Super Admin Account ---")
    admin_email = "admin@college.edu"
    admin = await user_repo.get_by_email(admin_email)
    admin_pwd_hash = get_password_hash("Admin@123")
    if not admin:
        admin = await user_repo.create_user(
            firebase_uid="admin_college_2026",
            email=admin_email,
            name="System Administrator",
            role=UserRole.ADMIN,
            account_status=AccountStatus.ACTIVE,
            phone="+91 99000 00001",
            password_hash=admin_pwd_hash
        )
        print(f"Created dedicated Super Admin: {admin_email} (Password: Admin@123)")
    else:
        await user_repo.update_user(admin["_id"], {"role": UserRole.ADMIN.value, "password_hash": admin_pwd_hash, "account_status": AccountStatus.ACTIVE.value})
        print(f"Updated Super Admin: {admin_email}")

    print("\n--- 2. Provisioning Verified Transport Manager Account ---")
    manager_email = "manager@college.edu"
    manager = await user_repo.get_by_email(manager_email)
    manager_pwd_hash = get_password_hash("Manager@123")
    if not manager:
        manager = await user_repo.create_user(
            firebase_uid="mgr_college_2026",
            email=manager_email,
            name="College Transport Manager",
            role=UserRole.BUS_MANAGER,
            account_status=AccountStatus.ACTIVE,
            phone="+91 98765 43210",
            password_hash=manager_pwd_hash,
            extra_fields={"employee_id": "EMP-TM-01", "department": "Transport Management"}
        )
        print(f"Created verified Transport Manager: {manager_email} (Password: Manager@123)")
    else:
        await user_repo.update_user(manager["_id"], {"password_hash": manager_pwd_hash, "account_status": AccountStatus.ACTIVE.value})
        print(f"Updated Transport Manager: {manager_email}")

    print("\n--- 3. Provisioning Approved Driver Account ---")
    driver_email = "driver.kumar@college.edu"
    driver = await user_repo.get_by_email(driver_email)
    driver_pwd_hash = get_password_hash("Driver@123")
    if not driver:
        driver = await user_repo.create_user(
            firebase_uid="drv_kumar_college_2026",
            email=driver_email,
            name="R. Kumar (Driver)",
            role=UserRole.DRIVER,
            account_status=AccountStatus.ACTIVE,
            phone="+91 98123 45678",
            password_hash=driver_pwd_hash,
            extra_fields={"license_number": "DL-KA-04-20150012", "years_of_experience": 8, "emergency_contact": "+91 98123 00000"}
        )
        print(f"Created approved driver account: {driver_email} (Password: Driver@123)")
        await driver_app_repo.create_application(
            user_id=driver["_id"],
            license_number="DL-KA-04-20150012",
            years_of_experience=8,
            emergency_contact="+91 98123 00000",
            notes="Certified heavy passenger vehicle operator (Verified by Manager)"
        )
        # Mark application as approved
        apps = await driver_app_repo.list_applications()
        for a in apps:
            if a["user_id"] == driver["_id"]:
                await driver_app_repo.review_application(a["_id"], DriverApplicationStatus.APPROVED, manager["_id"], "Verified license")
    else:
        await user_repo.update_user(driver["_id"], {"password_hash": driver_pwd_hash, "account_status": AccountStatus.ACTIVE.value})
        print(f"Driver account exists: {driver_email}")

    print("\n--- 4. Provisioning Student Account ---")
    student_email = "student.ananya@college.edu"
    student = await user_repo.get_by_email(student_email)
    student_pwd_hash = get_password_hash("Student@123")
    if not student:
        student = await user_repo.create_user(
            firebase_uid="std_ananya_college_2026",
            email=student_email,
            name="Ananya Sharma (Student)",
            role=UserRole.STUDENT,
            account_status=AccountStatus.ACTIVE,
            phone="+91 97000 11223",
            password_hash=student_pwd_hash
        )
        print(f"Created student account: {student_email} (Password: Student@123)")
    else:
        await user_repo.update_user(student["_id"], {"password_hash": student_pwd_hash, "account_status": AccountStatus.ACTIVE.value})
        print(f"Student account exists: {student_email}")

    print("\n--- 5. Seeding Test College Buses ---")
    buses_to_create = [
        {"bus_number": "BUS-01", "reg": "KA-01-F-1001", "cap": 50},
        {"bus_number": "BUS-02", "reg": "KA-01-F-1002", "cap": 45},
        {"bus_number": "BUS-03", "reg": "KA-01-F-1003", "cap": 52}
    ]
    created_buses = []
    for b in buses_to_create:
        existing = await bus_repo.get_by_bus_number(b["bus_number"])
        if not existing:
            bus = await bus_repo.create_bus(
                bus_number=b["bus_number"],
                capacity=b["cap"],
                registration_number=b["reg"],
                operational_status=BusStatus.ACTIVE
            )
            created_buses.append(bus)
            print(f"Created test bus {b['bus_number']} ({b['reg']})")
        else:
            created_buses.append(existing)

    print("\n--- 6. Seeding Test College Stops ---")
    stops_to_create = [
        {"name": "Campus Main Entrance Gate", "lat": 12.9716, "lon": 77.5946, "addr": "College Campus Road"},
        {"name": "South Hostel Quadrangle", "lat": 12.9760, "lon": 77.5990, "addr": "Hostel Avenue"},
        {"name": "Metro Green Line Station", "lat": 12.9820, "lon": 77.6050, "addr": "Central Metro Junction"},
        {"name": "City Junction Terminal", "lat": 12.9900, "lon": 77.6150, "addr": "Ring Road Outer Circle"}
    ]
    created_stops = []
    for s in stops_to_create:
        existing_stops = await stop_repo.list_stops(search=s["name"])
        match = next((x for x in existing_stops if x["name"] == s["name"]), None)
        if not match:
            stop = await stop_repo.create_stop(
                name=s["name"],
                latitude=s["lat"],
                longitude=s["lon"],
                address=s["addr"],
                created_by=manager["_id"]
            )
            created_stops.append(stop)
            print(f"Created stop: {s['name']}")
        else:
            created_stops.append(match)

    print("\n--- 7. Seeding Test Route ---")
    routes = await route_repo.list_routes()
    route_name = "Route 1: Campus to City Terminal"
    route = next((r for r in routes if r["route_name"] == route_name), None)
    if not route and len(created_stops) >= 4:
        stop_ids = [s["_id"] for s in created_stops]
        stops_data = await stop_repo.get_by_ids(stop_ids)
        calc = await compute_road_route(stops_data)
        route = await route_repo.create_route(
            route_name=route_name,
            origin_stop_id=stop_ids[0],
            destination_stop_id=stop_ids[-1],
            ordered_stop_ids=stop_ids,
            route_geometry=calc["route_geometry"],
            distance_meters=calc["distance_meters"],
            estimated_travel_seconds=calc["estimated_travel_seconds"],
            description="Daily morning and evening shuttle connecting Campus to City Terminal",
            created_by=manager["_id"]
        )
        print(f"Created test route: {route_name} (Distance: {calc['distance_meters']/1000:.2f} km)")
    else:
        print(f"Test route already exists: {route_name}")

    print("\n--- 8. Seeding Initial Assignment ---")
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing_assigns = await assignment_repo.list_assignments(driver_id=driver["_id"], service_date=today_str)
    if not existing_assigns and route and created_buses:
        assign = await assignment_repo.create_assignment(
            bus_id=created_buses[0]["_id"],
            driver_id=driver["_id"],
            route_id=route["_id"],
            service_date=today_str,
            scheduled_departure="08:30",
            assigned_by=manager["_id"]
        )
        # Driver accepts
        await assignment_repo.respond_to_assignment(
            assignment_id=assign["_id"],
            driver_id=driver["_id"],
            status=AssignmentStatus.ACCEPTED
        )
        # Scheduled trip
        await trip_repo.create_or_get_scheduled_trip(
            assignment_id=assign["_id"],
            bus_id=created_buses[0]["_id"],
            driver_id=driver["_id"],
            route_id=route["_id"]
        )
        print(f"Created active assignment for {driver_email} on {today_str} at 08:30 (Status: ACCEPTED)")
    else:
        print("Assignment already configured for today.")

    await close_mongo_connection()
    print("\n=======================================================")
    print("[SUCCESS] Provisioning complete! Valid credentials:")
    print(" 1. System Admin:      admin@college.edu         (Password: Admin@123)")
    print(" 2. Transport Manager: manager@college.edu       (Password: Manager@123)")
    print(" 3. Bus Driver:        driver.kumar@college.edu  (Password: Driver@123)")
    print(" 4. Student:           student.ananya@college.edu(Password: Student@123)")
    print("=======================================================")

if __name__ == "__main__":
    asyncio.run(main())
