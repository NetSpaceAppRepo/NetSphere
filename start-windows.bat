@echo off
REM ============================================================
REM   NetSphere - Windows Launcher (npm)
REM   Starts: trace-service on :3003, Next.js on :3000
REM ============================================================

setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ==========================================
echo   NetSphere - Windows Mode (npm)
echo ==========================================
echo.

REM --- Check Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo.
  echo Please install Node.js 18+ from:
  echo   https://nodejs.org/
  echo.
  echo Then re-run this script.
  pause
  exit /b 1
)

REM --- Show Node version ---
for /f "delims=" %%v in ('node -v') do set NODE_VERSION=%%v
echo Node.js version: %NODE_VERSION%
echo.

REM --- Create .env.local (only if it doesn't exist; auto-detection handles the rest) ---
if not exist ".env.local" (
    echo Creating .env.local...

    >".env.local" (
        echo # NetSphere laptop-mode environment
        echo # The frontend auto-detects laptop mode ^(port 3000 = direct, port 81 = sandbox^).
        echo # No NEXT_PUBLIC_TRACE_URL needed - defaults to http://localhost:3003.
        echo DATABASE_URL=file:./db/custom.db
    )

    echo Done.
    echo.
)

REM --- Kill anything on ports 3000 and 3003 (from previous runs) ---
echo Killing any leftover processes on ports 3000 and 3003...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do (
  taskkill /PID %%a /F >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003.*LISTENING"') do (
  taskkill /PID %%a /F >nul 2>nul
)
echo Done.
echo.

REM --- Install root dependencies (with scripts allowed) ---
echo [1/5] Installing root dependencies...
echo      (this may take 1-3 minutes on first run)
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed in root.
  echo This is usually a network issue. Check your internet connection.
  echo.
  pause
  exit /b 1
)
echo      Root dependencies installed.
echo.

REM --- Rebuild native modules (downloads @swc/core, sharp, etc.) ---
echo [2/5] Building native modules (sharp, swc, esbuild)...
call npm rebuild
if errorlevel 1 (
  echo.
  echo WARNING: npm rebuild had errors. Next.js may not start correctly.
  echo You can try running: npm install --foreground-scripts
  echo.
)
echo      Native modules ready.
echo.

REM --- Install trace-service dependencies ---
echo [3/5] Installing trace-service dependencies...
pushd "mini-services\trace-service"
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed in trace-service.
  popd
  pause
  exit /b 1
)
call npm rebuild
popd
echo      Trace-service dependencies installed.
echo.

REM --- Start trace-service in a new window ---
echo [4/5] Starting trace-service on http://localhost:3003 ...
start "NetSphere Trace Service" cmd /k "cd /d %~dp0mini-services\trace-service && npx tsx index.ts & echo. & echo ========================================== & echo Trace-service stopped. Close this window. & echo ========================================== & pause"

REM --- Wait for it to come up ---
echo      Waiting for trace-service to start (3 seconds)...
timeout /t 3 /nobreak >nul
echo      Trace-service should now be running in a separate window.
echo.

REM --- Start Next.js in foreground ---
echo [5/5] Starting Next.js on http://localhost:3000 ...
echo.
echo ==========================================
echo   Open http://localhost:3000 in your browser
echo.
echo   Two windows are open:
echo     1. THIS window  = Next.js frontend
echo     2. OTHER window = Trace-service backend
echo.
echo   Close BOTH windows to stop everything.
echo   Or press Ctrl+C here to stop Next.js.
echo ==========================================
echo.

call npm run dev

REM --- If we get here, Next.js stopped (Ctrl+C or error) ---
echo.
echo ==========================================
echo   Next.js has stopped.
echo.
echo   If you saw an ERROR above:
echo     - "Cannot find module" = run this script again
echo     - "EADDRINUSE" = port 3000 is in use, close other apps
echo     - "swc" error = run: npm rebuild @swc/core
echo.
echo   The trace-service window may still be open.
echo   Close it manually to stop the backend.
echo ==========================================
pause

endlocal
