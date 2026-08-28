$ErrorActionPreference = "Stop"

Write-Host "تجهيز نظام تأجيرك على Windows" -ForegroundColor Cyan
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "لم يتم العثور على Node.js. ثبّت إصدار LTS من https://nodejs.org/ ثم أعد تشغيل هذا الملف." -ForegroundColor Yellow
  exit 1
}

$nodeVersion = node --version
Write-Host "Node.js: $nodeVersion"

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
  Write-Host "تثبيت pnpm..." -ForegroundColor Green
  npm install --global pnpm
}

Write-Host "تثبيت مكتبات النظام..." -ForegroundColor Green
pnpm install

if (-not (Test-Path ".env")) {
  @"
# انسخ القيم الفعلية من إعدادات مشروع تأجيرك
DATABASE_URL=
JWT_SECRET=غيّر_هذه_القيمة_السرية
VITE_APP_ID=local
VITE_LOCAL_AUTH_ENABLED=true
LOCAL_AUTH_ENABLED=true
LOCAL_ADMIN_USERNAME=admin
LOCAL_ADMIN_PASSWORD=غيّر_هذه_الكلمة
VITE_OAUTH_PORTAL_URL=https://manus.im
OAUTH_SERVER_URL=https://api.manus.im
"@ | Set-Content -Encoding UTF8 .env
  Write-Host "تم إنشاء .env. أدخل DATABASE_URL وكلمة مرور المدير المحلي قبل التشغيل." -ForegroundColor Yellow
}

Write-Host "اكتمل تجهيز Node.js والمكتبات." -ForegroundColor Green
Write-Host "الخطوة التالية: شغّل .\\setup-local-db.ps1 بعد تثبيت وتشغيل MySQL أو MariaDB." -ForegroundColor Cyan
Write-Host "بعد نجاح قاعدة البيانات، شغّل run-windows.bat لفتح النظام." -ForegroundColor Green
