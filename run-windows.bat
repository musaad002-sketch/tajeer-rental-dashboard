@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo لم يتم العثور على Node.js.
  echo ثبت Node.js LTS من https://nodejs.org/ ثم شغل setup-windows.ps1
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo لم يتم العثور على pnpm.
  echo شغل setup-windows.ps1 من PowerShell أولا.
  pause
  exit /b 1
)

if not exist node_modules (
  echo تثبيت مكتبات النظام لأول مرة...
  call pnpm install
)

echo تشغيل نظام تأجيرك...
echo اترك هذه النافذة مفتوحة أثناء استخدام النظام.
echo افتح المتصفح على العنوان الذي سيظهر أدناه.
call pnpm dev
pause
