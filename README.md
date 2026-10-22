# AI-Enabled College Bus Tracking and Smart ETA Prediction System

A production-oriented, full-stack, dynamic, real-time college bus tracking web application built with **React + Vite + TypeScript + Tailwind CSS**, **Python FastAPI**, **MongoDB**, **Firebase Authentication**, **Google Maps & Routes API**, and **Phone Browser GPS Tracking**.

---

## Architecture Overview

```text
college-bus-tracking/
├── frontend/                     # React 19 + TypeScript + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── api/                 # Strongly-typed API clients (Admin, Auth, Buses, Routes, Trips, etc.)
│   │   ├── components/          # Reusable UI (MapView with Google Maps & SVG fallback, Badges, etc.)
│   │   ├── context/             # AuthContext (JWT & Dev Login) & WebSocketContext
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx    # Role selection step (Student, Driver, Manager, Admin) + Sign In/Sign Up
│   │   │   ├── admin/           # Super Admin Console: Manager verification (Approve/Reject) & System metrics
│   │   │   ├── student/         # Student Portal: Route selection, Live map, Stop ETA
│   │   │   ├── driver/          # Driver Console: Arrival verification, Phone GPS tracking, End trip
│   │   │   └── manager/         # Manager Console: Bus CRUD, Route Builder, Dispatcher, Driver Review, ML Center
│   │   └── types/               # Shared domain interfaces
│   ├── .env.example             # Frontend environment variables
│   └── package.json
├── backend/                      # Python FastAPI + Motor (Async MongoDB)
│   ├── app/
│   │   ├── api/routes/          # REST Endpoints for Admin, Auth, Buses, Routes, Trips, Manager, etc.
│   │   ├── core/                # App Settings & Configurable Thresholds
│   │   ├── db/                  # MongoDB Connection Manager & Index Initializer
│   │   ├── ml/                  # Machine Learning ETA Predictor (RandomForest / XGBoost)
│   │   ├── models/              # Domain Models
│   │   ├── repositories/        # Data Access Layer (Users, Buses, Routes, Trips, Audits, etc.)
│   │   ├── schemas/             # Pydantic Schemas & Request/Response Validation
│   │   ├── services/            # Auth (bcrypt), Geo (Haversine, Routes API, Polylines), ETA Service
│   │   ├── websocket/           # Channel-Based WebSocket Connection Manager
│   │   └── main.py              # Application Entrypoint, Lifespan & /ws endpoint
│   ├── tests/                   # Pytest test suite (11 tests covering all workflows)
│   ├── .env.example             # Backend environment template
│   └── requirements.txt         # Pinned backend dependencies
├── scripts/
│   └── seed_demo_data.py        # Provisions Admin, Manager, Driver, Student and fleet records
└── README.md
```

---

## Key Features & Highlights

1. **Role Selection Gate & Registration:** Before accessing sign in or sign up, users select their role (**Student**, **Bus Driver**, **Transport Manager**, or **Super Admin**). The portal then presents role-specific sign-in and registration forms.
2. **Two-Tier Verification Hierarchy:**
   - **Super Admin verifies Transport Managers:** Manager registrations (with Employee ID and Department) enter `pending_review` and must be approved by the Super Admin before they can log in.
   - **Transport Manager verifies Bus Drivers:** Driver registrations (with Commercial Driver's License, Experience, Emergency Contact) enter `pending_review` and must be approved by the Transport Manager.
   - **Students receive immediate active access.**
3. **Dedicated Super Admin Portal (`/admin`):** Review pending Transport Manager applications with single-click Approve / Reject actions and audit notes, view campus-wide transit metrics.
4. **Interactive Route Builder:** Visual stop sequence builder using Google Routes API to compute road-following geometry (encoded polyline) and exact road distance.
5. **No Decorative or Fake Tracking:** Student map markers only move when actual, valid GPS coordinates are broadcast by an authorized active driver.
6. **Phone GPS Arrival Verification:** Drivers independently arrive at the route's starting point and authenticate via the browser Geolocation API (within a configurable radius, e.g., 100m). **No route-navigation feature is provided to drivers.**
7. **Real Phone GPS Tracking:** Continuous streaming of GPS observations (coordinates, accuracy, timestamp, sequence numbers) with server-side speed anomaly and jump detection.
8. **Smart Route-Following ETA:** Calculates remaining road transit time using polyline geometry and intermediate dwell times, with seamless machine learning model integration.
9. **Real-time WebSockets:** Live event dispatching for assignments, trip starts, location updates, stale GPS flags, and trip completions.
10. **Stale GPS Detection:** Automatically detects when a live feed drops and displays warnings on student and manager maps.

---

## Prerequisites

Before starting, ensure the following are installed on your Windows machine:

1. **Python 3.11 or 3.12** (Verify with `python --version`)
2. **Node.js v18+ and npm** (Verify with `node -v` and `npm -v`)
3. **MongoDB**:
   - Local: [MongoDB Community Server](https://www.mongodb.com/try/download/community) or Docker container `docker run -d -p 27017:27017 mongo:latest`
   - Cloud: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free tier cluster.

---

## Step-by-Step Installation & Setup (Windows & VS Code)

### 1. Clone or Open the Workspace

Open the project folder in **Visual Studio Code**:
```powershell
cd "e:\PROJECT\ML Google"
```

---

### 2. Configure Backend Virtual Environment & Dependencies

Open a PowerShell terminal in VS Code:
```powershell
# Navigate to backend folder
cd backend

# Create Python virtual environment (if not already created)
python -m venv venv

# Activate the virtual environment
.\venv\Scripts\Activate.ps1

# Upgrade pip and install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> **Tip:** If PowerShell displays an `ExecutionPolicy` error when activating the virtual environment, run:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

---

### 3. Configure Backend Environment Variables

In `backend/.env` (copy from `backend/.env.example`):
```env
PROJECT_NAME="AI-Enabled College Bus Tracking and Smart ETA Prediction System"
API_V1_STR=/api

# MongoDB Connection (Local or Atlas URI)
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=college_bus_tracking

# Firebase Authentication (Optional for local dev bypass)
FIREBASE_PROJECT_ID=
FIREBASE_CREDENTIALS_PATH=
DEV_AUTH_BYPASS=true

# Google Maps Server API Key (For Google Routes API road computation)
GOOGLE_MAPS_SERVER_KEY=

# Operational Thresholds
ARRIVAL_RADIUS_METERS=100.0
GPS_STALE_AFTER_SECONDS=60
GPS_MAX_AGE_SECONDS=30
GPS_MAX_ACCURACY_METERS=60.0
SPEED_ANOMALY_KMH_THRESHOLD=90.0
MAX_PLAUSIBLE_JUMP_SPEED_KMH=130.0
APPROACHING_STOP_METERS=500.0
APPROACHING_STOP_SECONDS=180.0

# JWT Session Secret
JWT_SECRET=college-bus-tracking-jwt-secret-key-2026-production
JWT_ALGORITHM=HS256
```

---

### 4. Run Backend Tests

Verify that database adapters, state transitions, security rules, and ML pipelines are working:
```powershell
# From the backend directory with venv activated:
pytest -v
```
All 8 test suites will execute and pass in under a second!

---

### 5. Provision Pre-seeded Accounts & Initial Test Fleet

Run the database setup script to provision the authorized Super Admin, Transport Manager, Bus Driver, Student, and test fleet:
```powershell
# From the project root:
cd "e:\PROJECT\ML Google"
backend\venv\Scripts\python scripts\seed_demo_data.py
```

This provisions pre-configured test credentials for all 4 roles:

| Role | Email | Password | Status | Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@college.edu` | `Admin@123` | Active | Authorize Transport Managers, View system telemetry |
| **Transport Manager** | `manager@college.edu` | `Manager@123` | Active | Authorize Drivers, Create routes, Assign buses, Train ML |
| **Bus Driver** | `driver.kumar@college.edu` | `Driver@123` | Active | Accept assignments, GPS-verify start arrival, Broadcast live GPS |
| **Student** | `student.ananya@college.edu` | `Student@123` | Active | View live routes, Track buses, View smart ETAs |

---

### 6. User Experience & Verification Workflow

1. **Initial Screen (Role Selection Gate):**
   - When users open the app or visit `/login`, the application displays interactive role selection cards (**Student**, **Bus Driver**, **Transport Manager**, or **Super Admin**).
   - Selecting a role reveals the tailored **Sign In** and **Sign Up** tabs for that specific role.
2. **Student Self-Registration:**
   - Any student can register with their name, college email, and password.
   - Student accounts are set to `active` immediately with instantaneous access to live bus tracking.
3. **Driver Self-Registration & Manager Verification:**
   - Drivers register with their Commercial Driver's License number, years of driving experience, and emergency contact.
   - Driver accounts are placed in `pending_review` status.
   - If a driver attempts to log in before approval, the app blocks them with a clear message: *"Your driver account is currently PENDING verification by the College Transport Manager."*
   - The Transport Manager logs in, opens the **Driver Applications** tab, and reviews the application with **Approve** or **Reject** actions.
4. **Transport Manager Registration & Super Admin Verification:**
   - Transport Managers register with their institutional Employee ID and Department.
   - Manager accounts enter `pending_review` status.
   - If a manager attempts to log in before approval, the app blocks them: *"Your Transport Manager account is currently PENDING verification by the System Administrator."*
   - The Super Admin logs in (`admin@college.edu` / `Admin@123`), opens the **Super Admin Governance** console (`/admin`), and clicks **Approve** (with optional institutional notes) to activate the manager.

---

### 7. Start the FastAPI Backend Server

In Terminal 1:
```powershell
cd "e:\PROJECT\ML Google\backend"
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Verify the health check endpoint in your browser:
[http://localhost:8000/api/health](http://localhost:8000/api/health)
Interactive Swagger API documentation:
[http://localhost:8000/docs](http://localhost:8000/docs)

---

### 8. Configure Frontend Environment & Start Vite

Open a new PowerShell terminal (Terminal 2):
```powershell
cd "e:\PROJECT\ML Google\frontend"

# Install node dependencies (if not already installed)
npm install

# Start Vite development server
npm run dev
```
Open your browser and navigate to:
[http://localhost:5173](http://localhost:5173)

---

## Testing Real GPS Tracking on a Mobile Phone

The HTML5 Geolocation API requires a **Secure Context (HTTPS)** or `localhost` to access real phone GPS hardware.

To test with an actual physical smartphone:
1. Ensure your PC and phone are connected to the same Wi-Fi network.
2. Run a secure tunnel tool (e.g., `localtunnel` or `ngrok`):
   ```powershell
   npx localtunnel --port 5173
   ```
3. Open the resulting HTTPS URL on your phone's browser (Safari/Chrome).
4. Log in as **Driver** (`driver.kumar@college.edu`).
5. Arrive at the starting point and tap **Verify Starting-Point Arrival**.
6. When prompted, tap **Allow Location Access While Using the App**.
7. Tap **Start Trip & Begin GPS Broadcasting**.
8. In another browser window, open the **Student Dashboard** (`student.ananya@college.edu`) to observe real-time movement and accurate ETA updates!

---

## Troubleshooting Guide

### 1. `uvicorn` is not recognized
- Make sure you activated the virtual environment: `.\venv\Scripts\Activate.ps1`.
- Alternatively, run `python -m uvicorn app.main:app --reload`.

### 2. MongoDB connection failure
- If using local MongoDB, ensure the Windows service is running: `Get-Service -Name "*mongo*" | Start-Service`.
- If using MongoDB Atlas, verify your connection string in `backend/.env` and ensure your IP is whitelisted under Network Access in Atlas.

### 3. Google Maps not displaying satellite or street map
- Check that `VITE_GOOGLE_MAPS_BROWSER_KEY` is provided in `frontend/.env`.
- Ensure the **Maps JavaScript API**, **Places API**, and **Routes API** are enabled in the Google Cloud Console.
- Ensure billing is enabled for your Google Cloud Project.
- If no key is configured, the application automatically displays an interactive vector road map with full live marker updates and stop pins.

### 4. Browser GPS permission denied
- Mobile browsers block geolocation on unencrypted HTTP (except on localhost). Use an HTTPS tunnel (`localtunnel` or `ngrok`) for testing on physical smartphones.
- Check device Settings > Privacy > Location Services > Browser > Set to "While Using App".

### 5. WebSocket connection failures
- Check that the backend server is running on port 8000.
- Verify that your token in `localStorage` has not expired (simply log out and log in again).

---

## Definition of Done Verification

- [x] Authoritative RBAC in MongoDB for Student, Driver, and Bus Manager.
- [x] Zero hardcoded operational data. Dynamic empty states throughout.
- [x] Interactive Route Builder with road geometry computation.
- [x] Real-time assignment conflict checks on both bus and driver.
- [x] Driver starting-point GPS verification (strictly no route navigation feature in Driver module).
- [x] Authoritative Start Trip execution and atomic status updates.
- [x] Real phone GPS streaming with speed anomaly and jump detection.
- [x] Student live map with genuine coordinates, stale warnings, and reconnecting banners.
- [x] Route-aware ETA calculation and intermediate dwell times.
- [x] Held-out evaluation for Machine Learning ETA model (RandomForest/XGBoost).
- [x] End-to-end automated test suite covering critical workflows.
