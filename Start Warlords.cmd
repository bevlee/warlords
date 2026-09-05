@echo off
setlocal
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\Node26\node-v26.8.1-win-x64;%PATH%"
call npm.cmd run dev -- --host 127.0.0.1 --open
if errorlevel 1 pause
