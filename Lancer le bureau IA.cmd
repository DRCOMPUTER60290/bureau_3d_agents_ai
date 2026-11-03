@echo off
chcp 65001 >nul
title Bureau IA - Atelier Agents
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installez Node.js puis relancez ce fichier.
  pause
  exit /b 1
)
node.exe scripts\launch.mjs
if errorlevel 1 pause
