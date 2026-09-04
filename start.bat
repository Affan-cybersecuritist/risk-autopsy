@echo off
echo ==================================================
echo   Starting Risk Autopsy (Frontend + Backend)
echo ==================================================

:: 1. Setup Python Virtual Environment
if not exist "venv\" (
    echo [1/3] Creating Python virtual environment...
    python -m venv venv
)
echo [1/3] Installing Python dependencies...
call venv\Scripts\activate
pip install -r requirements.txt -q

:: 2. Setup Node frontend
echo [2/3] Installing Node.js dependencies...
cd webapp
call npm install --silent
cd ..

:: 3. Run both servers concurrently
echo [3/3] Starting servers...
npx -y concurrently -n "API,WEB" -c "blue,green" "python -m uvicorn backend.main:app --reload --port 8010" "cd webapp && npm run dev"
