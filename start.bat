@echo off
cd /d "%~dp0"
npx tsx src/app.ts > logs\app-stdout.log 2> logs\app-stderr.log
