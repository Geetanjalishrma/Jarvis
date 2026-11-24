@echo off
REM One-time setup for Jarvis on Windows (run from the JARVIS folder)
echo === Backend: creating virtual environment ===
cd backend
if exist venv rmdir /s /q venv
python -m venv venv
call venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cd ..
echo === Frontend: installing packages ===
cd frontend
call npm install
cd ..
echo.
echo Setup finished. Now run start-backend.bat and start-frontend.bat (two terminals).
pause
