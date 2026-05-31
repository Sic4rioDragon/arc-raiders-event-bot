@echo off
cd /d "%~dp0"

echo ==================================
echo ARC Raiders Event Bot Setup
echo ==================================
echo.

if not exist package.json (
    echo package.json was not found.
    echo Make sure this setup.bat is inside the bot folder.
    pause
    exit /b 1
)

echo Installing dependencies...
npm install

echo.
echo Setup complete.
echo.
echo If you have not done it yet:
echo 1. Copy .env.example to .env
echo 2. Put your bot token into .env
echo 3. Copy config.json.example to config.json
echo 4. Put your Discord application clientId into config.json
echo.
echo developmentGuildId is optional and can stay empty for the public/global bot.
echo.
pause