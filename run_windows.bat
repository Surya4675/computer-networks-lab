@echo off
setlocal
cd /d "%~dp0"
py -c "import flask" >nul 2>&1
if errorlevel 1 (
  echo Flask is not installed in this Python environment.
  echo Run: py -m pip install -r requirements.txt
  pause
  exit /b 1
)
start "NetLab Browser" http://127.0.0.1:5000
py app.py
