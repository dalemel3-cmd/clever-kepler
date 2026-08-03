@echo off
echo ====================================
echo   HPD App - Saving & Pushing Changes
echo ====================================
set /p commit_msg="Enter commit message (or press ENTER for default 'Sync updates'): "
if "%commit_msg%"=="" set commit_msg=Sync updates

git add .
git commit -m "%commit_msg%"
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Successfully pushed changes to GitHub!
) else (
    echo.
    echo Error pushing to GitHub. Check git status or network connection.
)
pause
