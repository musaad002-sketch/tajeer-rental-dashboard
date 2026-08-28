$ErrorActionPreference = "Stop"

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysql) {
  Write-Host "لم يتم العثور على mysql.exe. ثبّت XAMPP أو MariaDB، ثم أضف مجلد bin إلى PATH." -ForegroundColor Yellow
  exit 1
}

$hostName = if ($env:LOCAL_DB_HOST) { $env:LOCAL_DB_HOST } else { "127.0.0.1" }
$port = if ($env:LOCAL_DB_PORT) { $env:LOCAL_DB_PORT } else { "3306" }
$dbName = if ($env:LOCAL_DB_NAME) { $env:LOCAL_DB_NAME } else { "tajeerk_local" }
$dbUser = if ($env:LOCAL_DB_USER) { $env:LOCAL_DB_USER } else { "root" }
$dbPassword = $env:LOCAL_DB_PASSWORD

Write-Host "تهيئة قاعدة البيانات المحلية: $dbName" -ForegroundColor Cyan
Write-Host "إذا طلب mysql كلمة المرور، أدخل كلمة مرور مستخدم قاعدة البيانات." -ForegroundColor DarkGray

$auth = @("--host=$hostName", "--port=$port", "--user=$dbUser")
if ($dbPassword) { $auth += "--password=$dbPassword" } else { $auth += "--password" }

& mysql @auth -e "CREATE DATABASE IF NOT EXISTS `$dbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if ($LASTEXITCODE -ne 0) { throw "تعذر الاتصال بـ MySQL/MariaDB" }

$migration = (Get-Content ".\\drizzle\\0001_fat_old_lace.sql" -Raw) -replace "--> statement-breakpoint", ""
$migration | & mysql @auth $dbName
if ($LASTEXITCODE -ne 0) { throw "فشل إنشاء جداول النظام" }

Get-Content ".\database\local-customers.sql" -Raw | & mysql @auth $dbName
if ($LASTEXITCODE -ne 0) { throw "فشل استيراد العملاء" }

$envPath = Join-Path (Get-Location) ".env"
$connection = "mysql://$dbUser`:$dbPassword@$hostName`:$port/$dbName"
if (Test-Path $envPath) {
  $content = Get-Content $envPath -Raw
  $content = [regex]::Replace($content, '(?m)^DATABASE_URL=.*$', "DATABASE_URL=$connection")
} else {
  $content = "DATABASE_URL=$connection`n"
}
Set-Content -Path $envPath -Value $content -Encoding UTF8
Write-Host "تم إنشاء الجداول واستيراد العملاء وتحديث .env بنجاح." -ForegroundColor Green
