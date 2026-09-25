@echo off
setlocal enabledelayedexpansion

set "APP_DIR=C:\pos-printer-server"
set "LOG_DIR=%APP_DIR%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "LOG_FILE=%LOG_DIR%\printer-server.log"

echo ================================ >> "%LOG_FILE%"
echo [%DATE% %TIME%] START >> "%LOG_FILE%"
echo APP_DIR=%APP_DIR% >> "%LOG_FILE%"

echo WHOAMI= >> "%LOG_FILE%"
whoami >> "%LOG_FILE%" 2>&1

echo Checking node/npm... >> "%LOG_FILE%"
where node >> "%LOG_FILE%" 2>&1
where npm >> "%LOG_FILE%" 2>&1
node -v >> "%LOG_FILE%" 2>&1
call npm -v >> "%LOG_FILE%" 2>&1

cd /d "%APP_DIR%" >> "%LOG_FILE%" 2>&1
echo PWD=%CD% >> "%LOG_FILE%"

echo Files in APP_DIR: >> "%LOG_FILE%"
dir >> "%LOG_FILE%" 2>&1

echo Starting server... >> "%LOG_FILE%"
node "%APP_DIR%\printer-server.js" >> "%LOG_FILE%" 2>&1

echo [%DATE% %TIME%] EXIT (node stopped) >> "%LOG_FILE%"
endlocal
