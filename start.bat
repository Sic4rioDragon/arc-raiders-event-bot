@echo off
cd /d "%~dp0"

echo ==================================
echo ARC Raiders Event Bot
echo ==================================
echo.

if not exist node_modules (
    echo node_modules folder was not found.
    echo Run setup.bat first.
    echo.
    pause
    exit /b 1
)

npm start

echo.
echo Bot stopped.
pause