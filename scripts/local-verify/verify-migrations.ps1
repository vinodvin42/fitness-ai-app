<#
  Migration checks through the project's real Prisma workflow (16 Oct 2026).
  USER-RUN ONLY, from the root of the branch clone, after npm ci:

    powershell -ExecutionPolicy Bypass -File scripts\local-verify\verify-migrations.ps1
    Optional: -Port 55434

  Three separate results (never merged):
    A. FRESH INSTALL   empty database fynrox_fresh_prisma_test
         npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
         npx prisma migrate status --schema apps/api/prisma/schema.prisma   (must exit 0)
    B. UPGRADE         empty database fynrox_upgrade_prisma_test
         1. git worktree add --detach %TEMP%\fynrox-mig-base-<runId> <merge-base with origin/main>
         2. npx prisma migrate deploy --schema <worktree>\apps\api\prisma\schema.prisma   (main's migrations)
         3. <pg bin>\psql.exe -f scripts\local-verify\migration-upgrade\fixture-main.sql  (SYNTHETIC data)
         4. psql -f snapshot.sql   -> upgrade-snapshot-before.txt
         5. npx prisma migrate deploy --schema apps/api/prisma/schema.prisma   (the branch's new migrations)
         6. psql -f snapshot.sql   -> upgrade-snapshot-after.txt ; migrate status (must exit 0)
    C. FIXTURE SEEDING is step B3 only; its own log is upgrade-fixture.log.

  Uses the temporary PostgreSQL from _common.ps1 (existing binaries, new
  folder in %TEMP%, 127.0.0.1 only, deleted afterwards) - never any existing
  server, Azure or Render. Results: test-results\local-verify\<runId>\migrations\.
  Exit code 0 only if every step ran and exited 0. Does not push or deploy.
#>
param([int]$Port = 55434)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$out = Join-Path $repo "test-results\local-verify\$($script:RunId)\migrations"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$log = Join-Path $out "run-log.txt"
Set-Content -Path $log -Value "FynroX migration verification $($script:RunId) $(Get-Date -Format o)" -Encoding utf8
$fixtureDir = Join-Path $PSScriptRoot "migration-upgrade"
$branchSchema = Join-Path $repo "apps\api\prisma\schema.prisma"

$steps = @("A fresh: migrate deploy", "A fresh: migrate status",
  "B upgrade: worktree", "B upgrade: main migrate deploy", "B upgrade: fixture", "B upgrade: snapshot before",
  "B upgrade: branch migrate deploy", "B upgrade: snapshot after", "B upgrade: migrate status")
$exit = [ordered]@{}
$pg = @{}
$worktree = $null
$worktreeCreated = $false

function Step([string]$key, [string]$dir, [string]$cmd, [string[]]$a) {
  $code = Invoke-Logged $log $key $dir $cmd $a
  $exit[$key] = $code
  return $code
}

function Invoke-PsqlFile([string]$key, [string]$db, [string]$file, [string]$outFile) {
  $env:PGPASSWORD = $pg.Password
  try {
    $psql = Join-Path $pg.Bin "psql.exe"
    $psqlArgs = @("-h", "127.0.0.1", "-p", "$($pg.Port)", "-U", $pg.User, "-d", $db, "-X", "-v", "ON_ERROR_STOP=1", "-f", $file)
    Write-Log $log ""
    Write-Log $log "=== $key"
    Write-Log $log "    cmd: $psql $($psqlArgs -join ' ')"
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $output = & $psql @psqlArgs 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    ($output | ForEach-Object { Protect-Text "$_" }) | Set-Content -Path $outFile -Encoding utf8
    Write-Log $log "    output: $outFile"
    Write-Log $log "    exit code: $code"
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  $exit[$key] = $code
  return $code
}

try {
  if (-not (Test-Path -LiteralPath (Join-Path $repo "node_modules\.bin\prisma.cmd"))) { throw "Prisma CLI not found in node_modules. Run npm ci first." }
  Assert-NoDotenvFiles $repo
  Write-Log $log "repo $repo; HEAD $(git -C $repo rev-parse HEAD)"
  Start-TempPostgres $log $Port $pg

  # A. fresh install
  Set-RunEnv "DATABASE_URL" (New-TempDatabase $log $pg "fynrox_fresh_prisma_test")
  if ((Step "A fresh: migrate deploy" $repo $script:Npx @("prisma", "migrate", "deploy", "--schema", $branchSchema)) -ne 0) { throw "fresh install: prisma migrate deploy failed" }
  Step "A fresh: migrate status" $repo $script:Npx @("prisma", "migrate", "status", "--schema", $branchSchema) | Out-Null

  # B. upgrade from the branch's merge-base with main
  $base = (git -C $repo merge-base HEAD origin/main).Trim()
  Write-Log $log "Upgrade baseline commit: $base"
  $worktree = Join-Path ([System.IO.Path]::GetFullPath($env:TEMP)) "fynrox-mig-base-$($script:RunId)"
  if (Test-Path -LiteralPath $worktree) { throw "BLOCKER: $worktree already exists." }
  if ((Step "B upgrade: worktree" $repo "git" @("worktree", "add", "--detach", $worktree, $base)) -ne 0) { throw "could not create the baseline worktree" }
  $worktreeCreated = $true
  if (Test-Path -LiteralPath (Join-Path $worktree "apps\api\.env")) { throw "BLOCKER: baseline worktree has apps\api\.env" }
  Set-RunEnv "DATABASE_URL" (New-TempDatabase $log $pg "fynrox_upgrade_prisma_test")
  if ((Step "B upgrade: main migrate deploy" $repo $script:Npx @("prisma", "migrate", "deploy", "--schema", (Join-Path $worktree "apps\api\prisma\schema.prisma"))) -ne 0) { throw "upgrade: main's migrations failed" }
  if ((Invoke-PsqlFile "B upgrade: fixture" "fynrox_upgrade_prisma_test" (Join-Path $fixtureDir "fixture-main.sql") (Join-Path $out "upgrade-fixture.log")) -ne 0) { throw "upgrade: synthetic fixture failed (see upgrade-fixture.log)" }
  Invoke-PsqlFile "B upgrade: snapshot before" "fynrox_upgrade_prisma_test" (Join-Path $fixtureDir "snapshot.sql") (Join-Path $out "upgrade-snapshot-before.txt") | Out-Null
  if ((Step "B upgrade: branch migrate deploy" $repo $script:Npx @("prisma", "migrate", "deploy", "--schema", $branchSchema)) -ne 0) { throw "upgrade: branch migrations failed" }
  Invoke-PsqlFile "B upgrade: snapshot after" "fynrox_upgrade_prisma_test" (Join-Path $fixtureDir "snapshot.sql") (Join-Path $out "upgrade-snapshot-after.txt") | Out-Null
  Step "B upgrade: migrate status" $repo $script:Npx @("prisma", "migrate", "status", "--schema", $branchSchema) | Out-Null

  $before = Get-Content -LiteralPath (Join-Path $out "upgrade-snapshot-before.txt")
  $after = Get-Content -LiteralPath (Join-Path $out "upgrade-snapshot-after.txt")
  Compare-Object $before $after | ForEach-Object { "{0} {1}" -f $_.SideIndicator, $_.InputObject } | Set-Content -Path (Join-Path $out "upgrade-diff.txt") -Encoding utf8
  Write-Log $log "Upgrade differences: $(Join-Path $out 'upgrade-diff.txt')  (<= before only, => after only)"
}
catch {
  Add-Failure $log "STOPPED: $($_.Exception.Message)"
}
finally {
  Stop-TempPostgres $log $pg
  if ($worktreeCreated -and $worktree -and (Test-Path -LiteralPath $worktree)) {
    $rc = Invoke-Logged $log "git worktree remove (this run's baseline folder only)" $repo "git" @("worktree", "remove", "--force", $worktree)
    if ($rc -ne 0) { Add-Failure $log "baseline worktree not removed: $worktree" }
  }
  Clear-RunEnv
  $code = Write-Result $log $exit $steps
  Write-Log $log "Results: $out"
}
exit $code
