<#
  FynroX connectivity journeys on a throwaway local PostgreSQL (16 Oct 2026).

  Run from the repository root, after `npm ci` has succeeded:
    powershell -ExecutionPolicy Bypass -File scripts\local-verify\run-connectivity.ps1

  What it does, in order (and every side effect):
    1. Checks prerequisites (node_modules present, PostgreSQL binaries found,
       port free). Installs nothing.
    2. Creates a NEW data folder under %TEMP% and starts a temporary
       PostgreSQL server on 127.0.0.1:<Port> (default 55432) with a random
       password held only in this process. Your existing PostgreSQL service
       and its databases are not touched.
    3. Creates the database fynrox_connectivity_test in that temporary server.
    4. Sets test-only environment variables for this PowerShell process only
       (random test-only JWT secrets, mock payments/AI/food data, no SMTP,
       Sentry, Redis or Razorpay keys). Nothing is written to .env files.
    5. npm run db:generate                (regenerates the Prisma client in node_modules)
       npm run connectivity:prepare-db    (claims the empty DB, applies migrations to it)
       npm run test:connectivity          (seeds synthetic TEST-ONLY accounts, runs journeys A-F)
       npm run connectivity:report        (writes the report)
    6. Stops the temporary server and deletes its data folder
       (pass -KeepDatabase to keep it for inspection).

  Output: apps\api\test-results\connectivity\
    run-log.txt (commands, exit codes, redacted output), junit.xml,
    evidence.jsonl, report.md, world.json (synthetic ids + a synthetic
    password for this throwaway run; do not share).

  It does not push, deploy, contact Azure/Render, send email or messages,
  or make payments.
#>
param(
  [int]$Port = 55432,
  [switch]$KeepDatabase
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$api = Join-Path $repo "apps\api"
$results = Join-Path $api "test-results\connectivity"
New-Item -ItemType Directory -Force -Path $results | Out-Null
$log = Join-Path $results "run-log.txt"
Set-Content -Path $log -Value "FynroX connectivity run $(Get-Date -Format o)" -Encoding utf8

$exit = [ordered]@{}
$pg = $null
try {
  if (-not (Test-Path (Join-Path $repo "node_modules"))) { throw "node_modules is missing. Run 'npm ci' in $repo first (see verify-batch0.ps1)." }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is not on PATH." }
  $docker = [bool](Get-Command docker -ErrorAction SilentlyContinue)
  Write-Log $log "Docker CLI on PATH: $docker (not used by this script)"

  $pg = Start-TempPostgres $log $Port
  $url = New-TempDatabase $log $pg "fynrox_connectivity_test"
  Set-IsolatedTestEnv $url

  $exit["db:generate"] = Invoke-Logged $log "Prisma client" $repo $script:Npm @("run", "db:generate", "--workspace=apps/api")
  if ($exit["db:generate"] -ne 0) { throw "prisma generate failed" }
  $exit["connectivity:prepare-db"] = Invoke-Logged $log "Prepare disposable database" $repo $script:Npm @("run", "connectivity:prepare-db", "--workspace=apps/api")
  if ($exit["connectivity:prepare-db"] -ne 0) { throw "database preparation failed" }
  $exit["test:connectivity"] = Invoke-Logged $log "Connectivity journeys A-F" $repo $script:Npm @("run", "test:connectivity", "--workspace=apps/api")
  $exit["connectivity:report"] = Invoke-Logged $log "Report" $repo $script:Npm @("run", "connectivity:report", "--workspace=apps/api")
}
catch {
  Write-Log $log ""
  Write-Log $log "STOPPED: $($_.Exception.Message)"
}
finally {
  Stop-TempPostgres $log $pg -Keep:$KeepDatabase
  Clear-ExternalEnv
  Write-Log $log ""
  Write-Log $log "Exit codes:"
  foreach ($k in $exit.Keys) { Write-Log $log ("  {0,-26} {1}" -f $k, $exit[$k]) }
  Write-Log $log "Report: $results\report.md"
  Write-Log $log "A non-zero test:connectivity exit is expected if any journey FAILED; read report.md for which."
}
