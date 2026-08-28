$ErrorActionPreference = "Stop"

$dump = Get-Command mysqldump -ErrorAction SilentlyContinue
if (-not $dump) { throw "لم يتم العثور على mysqldump.exe. ثبّت MySQL أو MariaDB وأضف مجلد bin إلى PATH." }

$hostName = if ($env:LOCAL_DB_HOST) { $env:LOCAL_DB_HOST } else { "127.0.0.1" }
$port = if ($env:LOCAL_DB_PORT) { $env:LOCAL_DB_PORT } else { "3306" }
$dbName = if ($env:LOCAL_DB_NAME) { $env:LOCAL_DB_NAME } else { "tajeerk_local" }
$dbUser = if ($env:LOCAL_DB_USER) { $env:LOCAL_DB_USER } else { "root" }
$dbPassword = $env:LOCAL_DB_PASSWORD
$backupDir = Join-Path (Get-Location) "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$output = Join-Path $backupDir "$dbName-$stamp.sql"

$auth = @("--host=$hostName", "--port=$port", "--user=$dbUser", "--single-transaction", "--routines", "--triggers")
if ($dbPassword) { $auth += "--password=$dbPassword" } else { $auth += "--password" }
Write-Host "إنشاء نسخة احتياطية: $output" -ForegroundColor Cyan
& mysqldump @auth $dbName | Set-Content -Path $output -Encoding UTF8
if ($LASTEXITCODE -ne 0) { Remove-Item $output -Force -ErrorAction SilentlyContinue; throw "فشل إنشاء النسخة الاحتياطية" }
Write-Host "تم إنشاء النسخة الاحتياطية بنجاح." -ForegroundColor Green
