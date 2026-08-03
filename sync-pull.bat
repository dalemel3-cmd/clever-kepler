@echo off
echo ====================================
echo   HPD App - Pulling Latest Changes
echo ====================================
git pull origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Successfully pulled latest changes!
    echo Running npm install in case dependencies were updated...
    npm install
    echo.
    echo Everything is up to date and ready!
) else (
    echo.
    echo Error pulling from GitHub. Please check your internet connection or git status.
)
pause
