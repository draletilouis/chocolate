param(
  [string]$BackupDirectory = ($env:BACKUP_DIR ?? (Join-Path (Get-Location) 'backups'))
)

$ErrorActionPreference = 'Stop'
if (-not $env:POSTGRES_DB) { throw 'POSTGRES_DB is required' }
if (-not $env:POSTGRES_USER) { throw 'POSTGRES_USER is required' }
if (-not $env:POSTGRES_HOST) { $env:POSTGRES_HOST = '127.0.0.1' }
if (-not $env:POSTGRES_PORT) { $env:POSTGRES_PORT = '5432' }

New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $BackupDirectory ("cocoa-production-$stamp.dump")
$env:PGPASSWORD = $env:POSTGRES_PASSWORD
try {
  & pg_dump --format=custom --file=$target --host=$env:POSTGRES_HOST --port=$env:POSTGRES_PORT --username=$env:POSTGRES_USER --dbname=$env:POSTGRES_DB --no-owner --no-privileges
  if ($LASTEXITCODE -ne 0) { throw "pg_dump exited with code $LASTEXITCODE" }
  Write-Output (ConvertTo-Json @{ event = 'maintenance.database_backup'; file = $target; at = (Get-Date).ToUniversalTime().ToString('o') })
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
