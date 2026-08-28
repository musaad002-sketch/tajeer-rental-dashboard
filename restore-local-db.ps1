$ErrorActionPreference = "Stop"

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysql) { throw "لم يتم العثور على mysql.exe. ثبّت MySQL أو MariaDB وأضف مجلد bin إلى PATH." }

$inputFile = $args[0]
if (-not $inputFile) { throw "الاستخدام: .\restore-local-db.ps1 .\backups\اسم-النسخة.sql" }
$inputFile = (Resolve-Path $inputFile -ErrorAction Stop).Path
$hostName = if ($env:LOCAL_DB_HOST) { $env:LOCAL_DB_HOST } else { "127.0.0.1" }
$port = if ($env:LOCAL_DB_PORT) { $env:LOCAL_DB_PORT } else { "3306" }
$dbName = if ($env:LOCAL_DB_NAME) { $env:LOCAL_DB_NAME } else { "tajeerk_local" }
$dbUser = if ($env:LOCAL_DB_USER) { $env:LOCAL_DB_USER } else { "root" }
$dbPassword = $env:LOCAL_DB_PASSWORD
$answer = Read-Host "سيتم استبدال بيانات قاعدة $dbName بالنسخة المحددة. اكتب RESTORE للمتابعة"
if ($answer -ne "RESTORE") { Write-Host "تم الإلغاء دون تغيير البيانات." -ForegroundColor Yellow; exit 0 }
if ($dbName -notmatch '^[A-Za-z0-9_]+$') { throw "اسم قاعدة البيانات يجب أن يحتوي على أحرف وأرقام وشرطة سفلية فقط." }

$auth = @("--host=$hostName", "--port=$port", "--user=$dbUser")
if ($dbPassword) { $auth += "--password=$dbPassword" } else { $auth += "--password" }
Write-Host "استعادة استبدالية للنسخة: $inputFile" -ForegroundColor Cyan
& mysql @auth -e "DROP DATABASE IF EXISTS $dbName; CREATE DATABASE $dbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if ($LASTEXITCODE -ne 0) { throw "فشل تجهيز قاعدة البيانات للاستعادة" }
Get-Content $inputFile -Raw | & mysql @auth $dbName
if ($LASTEXITCODE -ne 0) { throw "فشل استعادة النسخة الاحتياطية" }
Write-Host "تمت الاستعادة الاستبدالية بنجاح. أعد تشغيل run-windows.bat إذا كان النظام مفتوحاً." -ForegroundColor Green
