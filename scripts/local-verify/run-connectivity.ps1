<#
  FynroX connectivity journeys on a temporary local PostgreSQL (16 Oct 2026).
  USER-RUN ONLY. Run from the root of the branch clone, after verify-batch0.ps1
  (or at least `npm ci`) has succeeded:

    powershell -ExecutionPolicy Bypass -File scripts\local-verify\run-connectivity.ps1
    Optional: -Port 55432   -KeepDatabase

  Commands it runs, in order (all output redacted into run-log.txt):
    1. Preflight: node_modules present; no .env in the clone (existence check
       only); clears old result files (four named files, nothing else).
    2. Temporary PostgreSQL (see _common.ps1 for every safeguard):
         <bin>\pg_ctl.exe --version, initdb.exe --version, ... (verifies paths/version)
         <bin>\initdb.exe -D %TEMP%\fynrox-temp-pg-<runId> -U fynrox_harness --pwfile=<temp> --auth=scram-sha-256 -E UTF8
         <bin>\pg_ctl.exe start -D <that folder> -l <folder>\server.log -w -t 60 -o "-p <port> -c listen_addresses=127.0.0.1"
         <bin>\psql.exe -h 127.0.0.1 -p <port> ... SHOW listen_addresses / port / data_directory   (must match)
         <bin>\createdb.exe -h 127.0.0.1 -p <port> -U fynrox_harness fynrox_connectivity_test
    3. Test-only environment for this PowerShell process only (random secrets,
       mock payments/AI/food data, no SMTP/Sentry/Redis/Razorpay keys).
    4. npm run db:generate --workspace=apps/api                (Prisma client into node_modules)
       npm run typecheck:connectivity --workspace=apps/api     (strict tsc over tests/connectivity; recorded, run continues)
       npm run connectivity:prepare-db --workspace=apps/api    (claims the empty DB; prisma migrate deploy on it)
       npm run test:connectivity --workspace=apps/api          (seeds TEST-ONLY accounts; journeys A-F)
       npm run connectivity:report --workspace=apps/api        (report.md)
    5. pg_ctl stop -D <that folder>; deletes that folder after ownership checks.

  Results: apps\api\test-results\connectivity\ (run-log.txt, junit.xml,
  evidence.jsonl, report.md, world.json with synthetic ids only).
  Exit code 0 only if every step ran and exited 0. A failed journey gives a
  non-zero exit by design; report.md says which and why.
  Does not push, deploy, contact Azure/Render, send messages or make payments.
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
Set-Content -Path $log -Value "FynroX connectivity run $($script:RunId) $(Get-Date -Format o)" -Encoding utf8

$steps = @("db:generate", "typecheck:connectivity", "connectivity:prepare-db", "test:connectivity", "connectivity:report")
$exit = [ordered]@{}
$pg = @{}
try {
  foreach ($f in @("evidence.jsonl", "junit.xml", "report.md", "world.json")) {
    $p = Join-Path $results $f
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $repo "node_modules"))) { throw "node_modules is missing. Run verify-batch0.ps1 (or npm ci) first." }
  if (-not (Get-Command $script:Npm -ErrorAction SilentlyContinue)) { throw "npm is not on PATH." }
  Assert-NoDotenvFiles $repo
  Write-Log $log "Repository: $repo  branch $(git -C $repo branch --show-current)  HEAD $(git -C $repo rev-parse HEAD)"

  Start-TempPostgres $log $Port $pg
  $url = New-TempDatabase $log $pg "fynrox_connectivity_test"
  Set-IsolatedTestEnv $url

  $exit["db:generate"] = Invoke-Logged $log "Prisma client" $repo $script:Npm @("run", "db:generate", "--workspace=apps/api")
  if ($exit["db:generate"] -ne 0) { throw "prisma generate failed" }
  # Strict type-check of the harness and journeys (the project's own typecheck does not cover tests).
  $exit["typecheck:connectivity"] = Invoke-Logged $log "Type-check the connectivity tests" $repo $script:Npm @("run", "typecheck:connectivity", "--workspace=apps/api")
  $exit["connectivity:prepare-db"] = Invoke-Logged $log "Prepare the disposable database" $repo $script:Npm @("run", "connectivity:prepare-db", "--workspace=apps/api")
  if ($exit["connectivity:prepare-db"] -ne 0) { throw "database preparation failed" }
  $exit["test:connectivity"] = Invoke-Logged $log "Connectivity journeys A-F" $repo $script:Npm @("run", "test:connectivity", "--workspace=apps/api")
  $exit["connectivity:report"] = Invoke-Logged $log "Report" $repo $script:Npm @("run", "connectivity:report", "--workspace=apps/api")
}
catch {
  Add-Failure $log "STOPPED: $($_.Exception.Message)"
}
finally {
  Stop-TempPostgres $log $pg -Keep:$KeepDatabase
  Clear-RunEnv
  $code = Write-Result $log $exit $steps
  Write-Log $log "Report (if the journeys ran): $results\report.md"
}
exit $code
