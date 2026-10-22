import logging
from datetime import datetime, timezone
from app.repositories.user_repo import user_repo, get_password_hash
from app.repositories.bus_repo import bus_repo
from app.repositories.stop_repo import stop_repo
from app.repositories.route_repo import route_repo
from app.repositories.assignment_repo import assignment_repo
from app.repositories.trip_repo import trip_repo
from app.repositories.location_repo import location_repo
from app.repositories.driver_application_repo import driver_app_repo
from app.schemas.enums import UserRole, AccountStatus, BusStatus, DriverApplicationStatus, AssignmentStatus, TripStatus
from app.services.geo_service import compute_road_route

logger = logging.getLogger("college_bus.seeder")

async def seed_default_data_if_empty():
    """
    Seeds initial administrative users, fleet buses, stops, and a default route
    if the database collections are currently empty.
    """
    try:
        # 1. Super Admin
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
            logger.info("Seeded Super Admin: admin@college.edu")

        # 2. Transport Manager
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
            logger.info("Seeded Transport Manager: manager@college.edu")

        # 3. Approved Bus Driver
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
            await driver_app_repo.create_application(
                user_id=driver["_id"],
                license_number="DL-KA-04-20150012",
                years_of_experience=8,
                emergency_contact="+91 98123 00000",
                notes="Certified heavy passenger vehicle operator (Verified by Manager)"
            )
            apps = await driver_app_repo.list_applications()
            for a in apps:
                if a["user_id"] == driver["_id"]:
                    await driver_app_repo.review_application(a["_id"], DriverApplicationStatus.APPROVED, manager["_id"], "Verified license")
            logger.info("Seeded Driver: driver.kumar@college.edu")

        # 4. Student
        student_email = "student.ananya@college.edu"
        student = await user_repo.get_by_email(student_email)
        student_pwd_hash = get_password_hash("Student@123")
        if not student:
            student = await user_repo.create_user(
                firebase_uid="std_ananya_college_2026",
                email=student_email,
                name="Ananya Sharma",
                role=UserRole.STUDENT,
                account_status=AccountStatus.ACTIVE,
                phone="+91 97000 11223",
                password_hash=student_pwd_hash,
                extra_fields={
                    "roll_number": "21CS042",
                    "department": "Computer Science & Engineering",
                    "year": "3rd Year",
                    "boarding_stop_name": "Sivakasi Central Bus Stand"
                }
            )
            logger.info("Seeded Student: student.ananya@college.edu")

        # 5. College Buses
        buses_to_create = [
            {"bus_number": "BUS-01", "reg": "TN-67-AB-1001", "cap": 50},
            {"bus_number": "BUS-02", "reg": "TN-67-AB-1002", "cap": 45},
            {"bus_number": "BUS-03", "reg": "TN-67-AB-1003", "cap": 52}
        ]
        for b in buses_to_create:
            existing = await bus_repo.get_by_bus_number(b["bus_number"])
            if not existing:
                await bus_repo.create_bus(
                    bus_number=b["bus_number"],
                    capacity=b["cap"],
                    registration_number=b["reg"],
                    operational_status=BusStatus.ACTIVE
                )
                logger.info(f"Seeded Bus: {b['bus_number']}")

        # 6. College Stops: Mepco Schlenk Engineering College, Sivakasi, and Virudhunagar
        stops_to_create = [
            {"name": "Mepco Schlenk Engineering College - Main Gate", "lat": 9.52554, "lon": 77.85408, "addr": "Mepco Nagar, Sivakasi-Virudhunagar Highway (SH-42)"},
            {"name": "Mepco Schlenk Engineering College - Campus Bus Bay", "lat": 9.52650, "lon": 77.85520, "addr": "Campus Bus Bay, Mepco Nagar, SH-42"},
            {"name": "Sivakasi Central Bus Stand", "lat": 9.45320, "lon": 77.79740, "addr": "Central Bus Stand, Sivakasi Town"},
            {"name": "Thiruthangal Junction Stop", "lat": 9.48150, "lon": 77.81180, "addr": "SH-42 Highway, Thiruthangal"},
            {"name": "Anaikuttam Reservoir Stop", "lat": 9.50200, "lon": 77.83400, "addr": "Anaikuttam Reservoir, SH-42"},
            {"name": "Pavali Bus Stop", "lat": 9.54800, "lon": 77.89200, "addr": "Pavali Junction, SH-42"},
            {"name": "Sulakkarai / District Collectorate Complex", "lat": 9.57400, "lon": 77.93800, "addr": "Master Plan Complex, Sulakkarai, Virudhunagar"},
            {"name": "Virudhunagar Old Bus Stand", "lat": 9.58550, "lon": 77.95720, "addr": "Town Centre, Virudhunagar"},
            {"name": "Virudhunagar Railway Junction", "lat": 9.58020, "lon": 77.96200, "addr": "Railway Feeder Road, Virudhunagar"}
        ]
        created_stops = []
        for s in stops_to_create:
            existing_stops = await stop_repo.list_stops(search=s["name"])
            match = next((x for x in existing_stops if x["name"] == s["name"]), None)
            if not match:
                st = await stop_repo.create_stop(
                    name=s["name"],
                    latitude=s["lat"],
                    longitude=s["lon"],
                    address=s["addr"],
                    created_by=manager["_id"] if manager else None
                )
                created_stops.append(st)
                logger.info(f"Seeded Stop: {s['name']}")
            else:
                created_stops.append(match)

        # 7. College Routes for Mepco, Sivakasi, and Virudhunagar
        existing_routes = await route_repo.list_routes()
        route1 = None
        route2 = None

        # Helper mapping by name
        stop_map = {s["name"]: s for s in created_stops}
        mepco_gate = stop_map.get("Mepco Schlenk Engineering College - Main Gate")
        sivakasi_bs = stop_map.get("Sivakasi Central Bus Stand")
        thiruthangal = stop_map.get("Thiruthangal Junction Stop")
        anaikuttam = stop_map.get("Anaikuttam Reservoir Stop")
        vnr_bs = stop_map.get("Virudhunagar Old Bus Stand")
        vnr_station = stop_map.get("Virudhunagar Railway Junction")
        sulakkarai = stop_map.get("Sulakkarai / District Collectorate Complex")
        pavali = stop_map.get("Pavali Bus Stop")

        if not any("Sivakasi" in r.get("route_name", "") for r in existing_routes):
            if sivakasi_bs and thiruthangal and anaikuttam and mepco_gate:
                r1_stops = [sivakasi_bs, thiruthangal, anaikuttam, mepco_gate]
                r1_ids = [s["_id"] for s in r1_stops]
                calc1 = await compute_road_route(r1_stops)
                route1 = await route_repo.create_route(
                    route_name="Route 1: Sivakasi Bus Stand to Mepco Schlenk College",
                    origin_stop_id=r1_ids[0],
                    destination_stop_id=r1_ids[-1],
                    ordered_stop_ids=r1_ids,
                    route_geometry=calc1["route_geometry"],
                    distance_meters=calc1["distance_meters"],
                    estimated_travel_seconds=calc1["estimated_travel_seconds"],
                    description="Morning college bus connecting Sivakasi Central, Thiruthangal, and Anaikuttam to Mepco Campus.",
                    created_by=manager["_id"] if manager else None
                )
                logger.info("Seeded Route 1: Sivakasi to Mepco Schlenk College")

        if not any("Virudhunagar" in r.get("route_name", "") for r in existing_routes):
            if vnr_station and vnr_bs and sulakkarai and pavali and mepco_gate:
                r2_stops = [vnr_station, vnr_bs, sulakkarai, pavali, mepco_gate]
                r2_ids = [s["_id"] for s in r2_stops]
                calc2 = await compute_road_route(r2_stops)
                route2 = await route_repo.create_route(
                    route_name="Route 2: Virudhunagar Old Bus Stand to Mepco Schlenk College",
                    origin_stop_id=r2_ids[0],
                    destination_stop_id=r2_ids[-1],
                    ordered_stop_ids=r2_ids,
                    route_geometry=calc2["route_geometry"],
                    distance_meters=calc2["distance_meters"],
                    estimated_travel_seconds=calc2["estimated_travel_seconds"],
                    description="Express service from Virudhunagar Railway Station, Old Bus Stand, and Collectorate to Mepco Campus.",
                    created_by=manager["_id"] if manager else None
                )
                logger.info("Seeded Route 2: Virudhunagar to Mepco Schlenk College")

        if not any("SH-42 Corridor" in r.get("route_name", "") for r in existing_routes):
            if sivakasi_bs and thiruthangal and mepco_gate and sulakkarai and vnr_bs:
                r3_stops = [sivakasi_bs, thiruthangal, mepco_gate, sulakkarai, vnr_bs]
                r3_ids = [s["_id"] for s in r3_stops]
                calc3 = await compute_road_route(r3_stops)
                await route_repo.create_route(
                    route_name="Route 3: Sivakasi - Mepco - Virudhunagar SH-42 Corridor",
                    origin_stop_id=r3_ids[0],
                    destination_stop_id=r3_ids[-1],
                    ordered_stop_ids=r3_ids,
                    route_geometry=calc3["route_geometry"],
                    distance_meters=calc3["distance_meters"],
                    estimated_travel_seconds=calc3["estimated_travel_seconds"],
                    description="Cross-district corridor connecting Sivakasi and Virudhunagar via Mepco Schlenk College.",
                    created_by=manager["_id"] if manager else None
                )
                logger.info("Seeded Route 3: Sivakasi - Mepco - Virudhunagar SH-42 Corridor")

        all_routes = await route_repo.list_routes()
        route1 = next((r for r in all_routes if "Sivakasi" in r["route_name"]), all_routes[0] if all_routes else None)
        route2 = next((r for r in all_routes if "Virudhunagar" in r["route_name"]), None)

        # 8. Seed Sample Active Trip for BUS-01 and Scheduled Assignment for BUS-02
        bus1 = await bus_repo.get_by_bus_number("BUS-01")
        bus2 = await bus_repo.get_by_bus_number("BUS-02")
        driver_doc = await user_repo.get_by_email("driver.kumar@college.edu")

        if bus1 and route1 and driver_doc:
            existing_active = await trip_repo.get_active_trip_by_bus(bus1["_id"])
            if not existing_active:
                today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                asg1 = await assignment_repo.create_assignment(
                    bus_id=bus1["_id"],
                    driver_id=driver_doc["_id"],
                    route_id=route1["_id"],
                    service_date=today_str,
                    scheduled_departure="07:30 AM",
                    assigned_by=manager["_id"] if manager else None
                )
                await assignment_repo.respond_to_assignment(asg1["_id"], driver_doc["_id"], AssignmentStatus.ACCEPTED)
                trip1 = await trip_repo.create_or_get_scheduled_trip(asg1["_id"], bus1["_id"], driver_doc["_id"], route1["_id"])
                await trip_repo.verify_arrival(trip1["_id"])
                started_trip = await trip_repo.start_trip(trip1["_id"])
                
                # Upsert initial live location with real speed (38.5 km/h) approaching Mepco Schlenk College
                await location_repo.upsert_live_location(
                    trip_id=started_trip["_id"],
                    bus_id=bus1["_id"],
                    driver_id=driver_doc["_id"],
                    latitude=9.4980,
                    longitude=77.8280,
                    accuracy_meters=6.5,
                    recorded_at=datetime.now(timezone.utc),
                    sequence_number=1,
                    speed_kmh=38.5
                )
                logger.info("Seeded Active Trip with live GPS location & speed for BUS-01 (Sivakasi-Mepco route)")

        if bus2 and route2 and driver_doc:
            asgs2 = await assignment_repo.list_assignments(bus_id=bus2["_id"])
            if not asgs2:
                today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                asg2 = await assignment_repo.create_assignment(
                    bus_id=bus2["_id"],
                    driver_id=driver_doc["_id"],
                    route_id=route2["_id"],
                    service_date=today_str,
                    scheduled_departure="08:15 AM",
                    assigned_by=manager["_id"] if manager else None
                )
                await assignment_repo.respond_to_assignment(asg2["_id"], driver_doc["_id"], AssignmentStatus.ACCEPTED)
                await trip_repo.create_or_get_scheduled_trip(asg2["_id"], bus2["_id"], driver_doc["_id"], route2["_id"])
                logger.info("Seeded Scheduled Assignment for BUS-02")

    except Exception as e:
        logger.warning(f"Seeder warning: {e}")
