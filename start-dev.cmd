@echo off
echo ========================================================
echo   Iniciando TuPuestito (Postgres Embebido + Dev Servers)
echo ========================================================
echo.

start "TuPuestito - PostgreSQL (5432)" cmd /k "pnpm.cmd db:embedded"
timeout /t 3 /nobreak >nul
start "TuPuestito - Apps (API 4000 & Web 3000)" cmd /k "pnpm.cmd dev"

echo.
echo [OK] Servicios lanzados en ventanas independientes.
echo      - Web: http://localhost:3000
echo      - API: http://localhost:4000
echo ========================================================
