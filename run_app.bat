@echo off
title AI College Bus Tracking System
echo ========================================================
echo Starting AI College Bus Tracking System
echo ========================================================

echo 1. Starting FastAPI Backend on port 8000...
start "Bus Tracking Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak >nul

echo 2. Starting Frontend Web App on port 5173...
start "Bus Tracking Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 2 /nobreak >nul

echo 3. Opening Application in Browser...
start http://localhost:5173

echo ========================================================
echo System is running!
echo Frontend: http://localhost:5173
echo Backend API Docs: http://localhost:8000/docs
echo ========================================================
