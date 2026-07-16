@echo off
echo Starting TB-303 Web App...

:: Try to start a local server using python if available
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Python found. Starting HTTP server on port 8000...
    start http://localhost:8000
    python -m http.server 8000
    exit /b
)

:: Try npx if node is installed
call npx --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Node.js found. Starting HTTP server via npx on port 8080...
    start http://localhost:8080
    call npx http-server -p 8080 -c-1
    exit /b
)

:: Fallback to opening the file directly in the browser
echo No local server environment found. Opening file directly...
start index.html
