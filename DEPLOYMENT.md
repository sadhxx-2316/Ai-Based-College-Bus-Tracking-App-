# Production Deployment Guide
**AI-Enabled College Bus Tracking and Smart ETA Prediction System**

This guide provides step-by-step instructions for deploying the system in production.

---

## Architecture Overview

```
                      Internet / Users (Mobile & Desktop)
                                     │
                                     ▼
                      ┌──────────────────────────────┐
                      │    Nginx Web Server (Port 80) │
                      │   (Serves React Production)  │
                      └──────────────┬───────────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              │ Proxy /api/ & /ws/                          │ Static SPA Routes
              ▼                                             ▼
┌──────────────────────────────┐              ┌───────────────────────────┐
│ FastAPI Backend (Port 8000)   │              │  Vite React Single Page   │
│ - Telemetry & ML Prediction  │              │  Application (Bundled)    │
│ - Driver/Student WebSockets  │              └───────────────────────────┘
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ MongoDB 7.0 (Port 27017)     │
│ - Geolocation Indexes        │
│ - Users, Routes, Trips       │
└──────────────────────────────┘
```

---

## Method 1: One-Click Docker Compose Deployment (Recommended)

This is the standard production method. It bundles MongoDB, the FastAPI ML Backend, and the Nginx Frontend into isolated, self-healing containers.

### Prerequisites
- Docker Engine (v24+) & Docker Compose (`docker compose version`)
- Git

### Deployment Steps

1. **Clone the repository on your server**:
   ```bash
   git clone https://github.com/sadhxx-2316/Ai-Based-College-Bus-Tracking-App-.git
   cd Ai-Based-College-Bus-Tracking-App-
   ```

2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   # Edit .env if you wish to change JWT_SECRET or provide Google Maps keys
   nano .env
   ```

3. **Build and Launch All Services**:
   ```bash
   docker compose up -d --build
   ```

4. **Verify Container Health**:
   ```bash
   docker compose ps
   ```
   All three containers (`college_bus_mongodb`, `college_bus_backend`, `college_bus_frontend`) should show status `Up` (healthy).

5. **Access the Application**:
   - Web Application: `http://<SERVER_IP>/` or `http://localhost/`
   - API Documentation (Swagger): `http://<SERVER_IP>:8000/docs`
   - Backend Health Check: `http://<SERVER_IP>:8000/api/health`

---

## Method 2: Cloud VPS (AWS EC2 / DigitalOcean / Ubuntu Server) with SSL

To deploy on a Linux VPS with custom domain and HTTPS/SSL:

1. **Set Up Domain DNS**:
   - Point your domain's `A` record (e.g., `bus.yourcollege.edu`) to your VPS public IP address.

2. **Install Docker on Ubuntu**:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   ```

3. **Run the Application**:
   ```bash
   git clone https://github.com/sadhxx-2316/Ai-Based-College-Bus-Tracking-App-.git
   cd Ai-Based-College-Bus-Tracking-App-
   docker compose up -d --build
   ```

4. **Set Up Free SSL with Certbot**:
   Install Certbot on the host:
   ```bash
   sudo apt-get update
   sudo apt-get install -y certbot python3-certbot-nginx
   ```
   Generate Let's Encrypt SSL certificate and auto-configure HTTPS:
   ```bash
   sudo certbot --nginx -d bus.yourcollege.edu
   ```

---

## Method 3: Cloud PaaS Deployment (Render / Railway + MongoDB Atlas)

If deploying without Docker on managed platforms:

### 1. Database: MongoDB Atlas (Free Tier)
1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a free **M0 Sandbox** cluster.
3. In **Network Access**, add `0.0.0.0/0` (allow from anywhere).
4. In **Database Access**, create a user and password.
5. Copy your connection string:
   `mongodb+srv://<username>:<password>@cluster0.mongodb.net/college_bus_tracking?retryWrites=true&w=majority`

### 2. Backend: Render or Railway
1. Create a new **Web Service** connected to your GitHub repository.
2. Root Directory: `backend`
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Environment Variables:
   - `MONGODB_URI`: `<Your MongoDB Atlas URI>`
   - `MONGODB_DATABASE`: `college_bus_tracking`
   - `JWT_SECRET`: `<A strong random string>`
   - `CORS_ORIGINS`: `["*"]`

### 3. Frontend: Vercel or Netlify
1. Create a new project connected to the `frontend` folder of your repository.
2. Framework Preset: **Vite**
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Environment Variable:
   - `VITE_API_BASE_URL`: `https://your-backend-service.onrender.com`

---

## Pre-Seeded Default Accounts

When the system boots for the first time with an empty database, it automatically seeds initial accounts:

| Role | Email | Password | Responsibilities |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@college.edu` | `Admin@123` | System oversight, approves Transport Managers |
| **College Transport Manager** | `manager@college.edu` | `Manager@123` | Approves drivers, manages routes, stops & fleet |
| **Bus Driver (Active)** | `driver.kumar@college.edu` | `Driver@123` | Conducts trips, transmits live GPS |

> [!IMPORTANT]
> Change the default passwords immediately after your initial production deployment by logging in and updating credentials, or by creating a new administrator account and deactivating the default.

---

## Maintenance & Monitoring

### Viewing Live Logs
```bash
# View backend application logs
docker compose logs -f backend

# View frontend / Nginx access logs
docker compose logs -f frontend

# View database logs
docker compose logs -f mongodb
```

### Updating the Application
```bash
# Pull latest updates from GitHub
git pull origin main

# Re-build and restart containers with zero-downtime
docker compose up -d --build
```

### Database Backups
```bash
# Create a timestamped backup of the MongoDB database
docker exec college_bus_mongodb mongodump --db college_bus_tracking --out /data/db/backup_$(date +%Y%m%d)
```
