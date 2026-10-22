@echo off
rem Double-click: starts Lumina (Docker) and the Vega Virtual Device (WSL2). Add -Bedrock for Claude on AWS.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0boot.ps1" %*
pause
