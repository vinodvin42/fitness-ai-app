<#
  Shared helpers for the local verification scripts (16 Oct 2026).
  Dot-sourced by verify-batch0.ps1, verify-migrations.ps1 and
  run-connectivity.ps1. Not run directly. Windows PowerShell 5.1+.

  TEMPORARY POSTGRESQL - safeguards (user approval of 16 Oct 2026)
   1. Verifies the actual executables (pg_ctl, initdb, createdb, psql,
      postgres) under C:\Program Files\PostgreSQL\<major>\bin and that they
      all report the same major version. Stops if not.
   2. Uses a new, uniquely named folder: %TEMP%\fynrox-temp-pg-<runId>
      (refuses if it already exists) and a port that is verified unused.
   3. Binds only to 127.0.0.1 and verifies that after start
      (SHOW listen_addresses / port / data_directory).
   4. Dedicated credentials: role fynrox_harness with a random test-only
      password held only in this process (scram-sha-256).
   5. Never connects to any existing server: every command passes
      -h 127.0.0.1 -p <port> explicitly, and PG* variables (PGHOST, PGPORT,
      PGDATA, PGSERVICE, ...) are removed from this process first.
   6. Does not register a Windows service, change the firewall or any
      system setting (pg_ctl start only; never pg_ctl register).
   7. Stops only that exact instance (pg_ctl stop -D <its folder>).
   8. Deletes only that exact folder, and only after checking it is under
      %TEMP%, has the expected name, contains this run's sentinel file and
      the server has stopped. No process kills, no wildcard deletes.
#>

$script:RunId = (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + ([guid]::NewGuid().ToString("N").Substring(0, 8))
$script:Secrets = New-Object System.Collections.Generic.List[string]
$script:EnvSet = New-Object System.Collections.Generic.List[string]
$script:Failures = New-Object System.Collections.Generic.List[string]

# npm.cmd/npx.cmd avoid npm.ps1 and execution-policy differences on Windows.
$script:Npm = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
$script:Npx = if (Get-Command npx.cmd -ErrorAction SilentlyContinue) { "npx.cmd" } else { "npx" }

# ---------------------------------------------------------------- secrets / logging

function New-TestSecret([string]$label) {
  $bytes = New-Object byte[] 18
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $value = "test-only-$label-" + ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
  $script:Secrets.Add($value)
  return $value
}

function New-HexKey64 {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $value = ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
  $script:Secrets.Add($value)
  return $value
}

function Protect-Text([string]$text) {
  if ($null -eq $text) { return $text }
  foreach ($s in $script:Secrets) { if ($s) { $text = $text.Replace($s, "[redacted]") } }
  return ($text -replace 'postgres(ql)?://[^\s"'']+', 'postgresql://[redacted]')
}

function Write-Log([string]$logFile, [string]$line) {
  $safe = Protect-Text $line
  Add-Content -Path $logFile -Value $safe -Encoding utf8
  Write-Host $safe
}

function Add-Failure([string]$logFile, [string]$what) {
  $script:Failures.Add($what)
  Write-Log $logFile "    FAILED: $what"
}

<# Runs a command, streams redacted output to console and log, returns the exit code. #>
function Invoke-Logged([string]$logFile, [string]$title, [string]$workDir, [string]$cmd, [string[]]$argList) {
  Write-Log $logFile ""
  Write-Log $logFile "=== $title"
  Write-Log $logFile "    cwd: $workDir"
  Write-Log $logFile "    cmd: $cmd $($argList -join ' ')"
  Push-Location $workDir
  try {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $cmd @argList 2>&1 | ForEach-Object { Write-Log $logFile ("    " + "$_") }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
  } finally {
    Pop-Location
  }
  Write-Log $logFile "    exit code: $code"
  return $code
}

<#
  Same, for a command that may leave a long-running child (pg_ctl start):
  output goes to files instead of a pipe, and we wait only for the
  command's own process, never its children.
#>
function Invoke-LoggedDetached([string]$logFile, [string]$title, [string]$exe, [string]$argString) {
  Write-Log $logFile ""
  Write-Log $logFile "=== $title"
  Write-Log $logFile "    cmd: $exe $argString"
  $outFile = Join-Path $env:TEMP "fynrox-$($script:RunId)-out.txt"
  $errFile = Join-Path $env:TEMP "fynrox-$($script:RunId)-err.txt"
  $p = Start-Process -FilePath $exe -ArgumentList $argString -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  $p.WaitForExit()
  foreach ($f in @($outFile, $errFile)) {
    if (Test-Path -LiteralPath $f) {
      Get-Content -LiteralPath $f | ForEach-Object { Write-Log $logFile ("    " + "$_") }
      Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Log $logFile "    exit code: $($p.ExitCode)"
  return $p.ExitCode
}

# ---------------------------------------------------------------- environment

function Set-RunEnv([string]$name, [string]$value) {
  Set-Item -Path "Env:$name" -Value $value
  if (-not $script:EnvSet.Contains($name)) { $script:EnvSet.Add($name) }
}

$script:ExternalVars = @(
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SENTRY_DSN", "REDIS_URL",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RENDER", "WEBSITE_SITE_NAME", "WEBSITE_INSTANCE_ID",
  "ADMIN_MFA_REQUIRED", "SUPER_ADMIN_REASON_REQUIRED", "APPROVAL_EXPIRY_DAYS",
  "PAYMENT_PROVIDER", "FOOD_DATA_PROVIDER", "AI_PROVIDER", "FYNROX_CONNECTIVITY", "FYNROX_SYNTHETIC_PASSWORD")
$script:PgVars = @("PGHOST", "PGHOSTADDR", "PGPORT", "PGUSER", "PGDATABASE", "PGPASSWORD", "PGPASSFILE",
  "PGSERVICE", "PGSERVICEFILE", "PGDATA", "PGSSLMODE", "PGOPTIONS", "PGTZ", "PGCLIENTENCODING")

function Clear-ExternalEnv { foreach ($n in $script:ExternalVars) { Remove-Item "Env:$n" -ErrorAction SilentlyContinue } }
function Clear-PgEnv { foreach ($n in $script:PgVars) { Remove-Item "Env:$n" -ErrorAction SilentlyContinue } }

<# Removes every variable these scripts set (DATABASE_URL, secrets, ...), so nothing lingers in the session. #>
function Clear-RunEnv {
  foreach ($n in $script:EnvSet) { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
  $script:EnvSet.Clear()
  Clear-ExternalEnv
  Clear-PgEnv
}

function Set-BaseTestEnv([string]$databaseUrl) {
  Set-RunEnv "DATABASE_URL" $databaseUrl
  Set-RunEnv "NODE_ENV" "test"
  Set-RunEnv "API_INSTANCE_COUNT" "1"
  Set-RunEnv "CORS_ORIGINS" "http://localhost:5173"
  Set-RunEnv "JWT_ACCESS_SECRET" (New-TestSecret "access")
  Set-RunEnv "JWT_REFRESH_SECRET" (New-TestSecret "refresh")
  Set-RunEnv "ADMIN_JWT_SECRET" (New-TestSecret "admin")
  Set-RunEnv "PROFESSIONAL_JWT_SECRET" (New-TestSecret "pro")
  Set-RunEnv "GYM_JWT_SECRET" (New-TestSecret "gym")
  Set-RunEnv "INFLUENCER_JWT_SECRET" (New-TestSecret "influencer")
  Set-RunEnv "TWO_FACTOR_ENCRYPTION_KEY" (New-HexKey64)
  Set-RunEnv "DOTENV_CONFIG_PATH" (Join-Path $env:TEMP "fynrox-no-dotenv-$($script:RunId)")
}

<# The project's own test suite: the same variables CI sets (.github/workflows/ci.yml), nothing more. #>
function Set-ProjectTestEnv([string]$databaseUrl) {
  Clear-ExternalEnv
  Set-BaseTestEnv $databaseUrl
}

<# The connectivity harness: base variables plus deterministic local substitutes for every provider. #>
function Set-IsolatedTestEnv([string]$databaseUrl) {
  Clear-ExternalEnv
  Set-BaseTestEnv $databaseUrl
  Set-RunEnv "FYNROX_CONNECTIVITY" "1"
  Set-RunEnv "PAYMENT_PROVIDER" "mock"
  Set-RunEnv "FOOD_DATA_PROVIDER" "seed"
  Set-RunEnv "AI_PROVIDER" "mock"
  Set-RunEnv "ADMIN_MFA_REQUIRED" "false"
  Set-RunEnv "SUPER_ADMIN_REASON_REQUIRED" "false"
  Set-RunEnv "APPROVAL_EXPIRY_DAYS" "7"
  Set-RunEnv "RAZORPAY_WEBHOOK_SECRET" (New-TestSecret "webhook")
  Set-RunEnv "FYNROX_SYNTHETIC_PASSWORD" (New-TestSecret "synthetic")
}

<# Stops if a .env file exists where Prisma or dotenv could load it. Only checks existence; never reads it. #>
function Assert-NoDotenvFiles([string]$repo) {
  $found = @()
  foreach ($rel in @(".env", "apps\api\.env", "apps\api\prisma\.env")) {
    if (Test-Path -LiteralPath (Join-Path $repo $rel)) { $found += $rel }
  }
  if ($found.Count -gt 0) {
    throw "Found $($found -join ', ') in $repo. Prisma could load it into the test run. Use a clean clone without .env files (the file was not read)."
  }
}

# ---------------------------------------------------------------- temporary PostgreSQL

function Get-PgInstallation([string]$logFile) {
  $root = "C:\Program Files\PostgreSQL"
  if (-not (Test-Path -LiteralPath $root)) { throw "BLOCKER: $root does not exist. Nothing was installed." }
  $tools = @("pg_ctl.exe", "initdb.exe", "createdb.exe", "psql.exe", "postgres.exe")
  $candidates = Get-ChildItem -LiteralPath $root -Directory | Where-Object {
    $bin = Join-Path $_.FullName "bin"
    ($_.Name -match '^\d+$') -and (@($tools | Where-Object { -not (Test-Path -LiteralPath (Join-Path $bin $_)) }).Count -eq 0)
  } | Sort-Object { [int]$_.Name } -Descending
  if (-not $candidates) { throw "BLOCKER: no complete PostgreSQL bin folder (pg_ctl, initdb, createdb, psql, postgres) under $root." }
  $dir = $candidates | Select-Object -First 1
  $bin = Join-Path $dir.FullName "bin"
  $major = [int]$dir.Name
  Write-Log $logFile "PostgreSQL binaries: $bin"
  foreach ($t in $tools) {
    $path = Join-Path $bin $t
    $ver = (& $path --version 2>&1 | Select-Object -First 1) -as [string]
    Write-Log $logFile ("  {0,-13} {1}  ->  {2}" -f $t, $path, $ver)
    if ($ver -notmatch "\(PostgreSQL\)\s+$major(\.|\s|$)") { throw "BLOCKER: $t reports '$ver', expected PostgreSQL $major." }
  }
  return @{ Bin = $bin; Major = $major }
}

function Test-PortFree([int]$port) {
  if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    throw "BLOCKER: Get-NetTCPConnection is unavailable, so the port cannot be verified as unused."
  }
  $inUse = @(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue)
  return ($inUse.Count -eq 0)
}

function Invoke-Psql($pg, [string]$database, [string]$sql) {
  $env:PGPASSWORD = $pg.Password
  try {
    $out = & (Join-Path $pg.Bin "psql.exe") -h 127.0.0.1 -p $pg.Port -U $pg.User -d $database -X -A -t -v ON_ERROR_STOP=1 -c $sql 2>&1
    $code = $LASTEXITCODE
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  if ($code -ne 0) { throw "psql failed ($code): $(Protect-Text ($out -join ' '))" }
  return (($out | Select-Object -First 1) -as [string]).Trim()
}

<#
  Starts the temporary cluster. $state is a hashtable owned by the caller
  and filled in as each resource is created, so cleanup knows exactly what
  exists even if a later step fails.
#>
function Start-TempPostgres([string]$logFile, [int]$port, [hashtable]$state) {
  Clear-PgEnv
  $inst = Get-PgInstallation $logFile
  $state.Bin = $inst.Bin
  if (-not (Test-PortFree $port)) { throw "BLOCKER: port $port is in use. Re-run with -Port <free port>; nothing was started." }
  Write-Log $logFile "Port $port verified unused."

  $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP)
  $dataDir = Join-Path $tempRoot "fynrox-temp-pg-$($script:RunId)"
  if (Test-Path -LiteralPath $dataDir) { throw "BLOCKER: $dataDir already exists; refusing to reuse it." }
  $state.DataDir = $dataDir
  $state.Port = $port
  $state.User = "fynrox_harness"
  $state.Password = New-TestSecret "pg"
  Write-Log $logFile "Temporary data folder: $dataDir"

  $pwFile = Join-Path $tempRoot "fynrox-pw-$($script:RunId).txt"
  [IO.File]::WriteAllText($pwFile, $state.Password)
  try {
    $code = Invoke-Logged $logFile "initdb (new folder; role fynrox_harness; scram-sha-256)" $tempRoot (Join-Path $inst.Bin "initdb.exe") @(
      "-D", $dataDir, "-U", $state.User, "--pwfile=$pwFile", "--auth=scram-sha-256", "-E", "UTF8", "--no-instructions")
  } finally {
    Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $dataDir) { $state.Created = $true }
  if ($code -ne 0) { throw "initdb failed (exit $code)." }
  [IO.File]::WriteAllText((Join-Path $dataDir "FYNROX_TEMP_CLUSTER.txt"), $script:RunId)

  $logPath = Join-Path $dataDir "server.log"
  $argString = "start -D `"$dataDir`" -l `"$logPath`" -w -t 60 -o `"-p $port -c listen_addresses=127.0.0.1`""
  $code = Invoke-LoggedDetached $logFile "pg_ctl start (127.0.0.1:$port only)" (Join-Path $inst.Bin "pg_ctl.exe") $argString
  if (Test-Path -LiteralPath (Join-Path $dataDir "postmaster.pid")) { $state.Started = $true }
  if ($code -ne 0) { throw "pg_ctl start failed (exit $code). See $logPath" }

  $listen = Invoke-Psql $state "postgres" "SHOW listen_addresses"
  $portSeen = Invoke-Psql $state "postgres" "SHOW port"
  $dirSeen = Invoke-Psql $state "postgres" "SHOW data_directory"
  Write-Log $logFile "Verified: listen_addresses=$listen port=$portSeen data_directory=$dirSeen"
  if ($listen -ne "127.0.0.1") { throw "BLOCKER: server is listening on '$listen', not 127.0.0.1 only." }
  if ($portSeen -ne "$port") { throw "BLOCKER: server reports port $portSeen, expected $port." }
  if ([IO.Path]::GetFullPath($dirSeen).TrimEnd('\') -ne $dataDir.TrimEnd('\')) { throw "BLOCKER: connected server's data directory is not this run's folder." }
}

function New-TempDatabase([string]$logFile, [hashtable]$pg, [string]$name) {
  $env:PGPASSWORD = $pg.Password
  try {
    $code = Invoke-Logged $logFile "createdb $name (on 127.0.0.1:$($pg.Port))" $env:TEMP (Join-Path $pg.Bin "createdb.exe") @(
      "-h", "127.0.0.1", "-p", "$($pg.Port)", "-U", $pg.User, $name)
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  if ($code -ne 0) { throw "createdb $name failed (exit $code)." }
  return "postgresql://$($pg.User):$($pg.Password)@127.0.0.1:$($pg.Port)/${name}?schema=public"
}

function Test-OwnTempDir([hashtable]$state) {
  if (-not $state.DataDir) { return $false }
  $sep = [System.IO.Path]::DirectorySeparatorChar
  $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd($sep) + $sep
  $full = [System.IO.Path]::GetFullPath($state.DataDir)
  if (-not $full.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  if ((Split-Path $full -Leaf) -ne "fynrox-temp-pg-$($script:RunId)") { return $false }
  $sentinel = Join-Path $full "FYNROX_TEMP_CLUSTER.txt"
  if (-not (Test-Path -LiteralPath $sentinel)) { return $false }
  return ((Get-Content -LiteralPath $sentinel -Raw).Trim() -eq $script:RunId)
}

function Stop-TempPostgres([string]$logFile, [hashtable]$state, [switch]$Keep) {
  if (-not $state -or -not $state.DataDir) { return }
  $dir = $state.DataDir
  if ($state.Started -or (Test-Path -LiteralPath (Join-Path $dir "postmaster.pid"))) {
    $code = Invoke-LoggedDetached $logFile "pg_ctl stop (this run's instance only)" (Join-Path $state.Bin "pg_ctl.exe") "stop -D `"$dir`" -m fast -w -t 60"
    if ($code -ne 0 -or (Test-Path -LiteralPath (Join-Path $dir "postmaster.pid"))) {
      Add-Failure $logFile "temporary server did not stop cleanly; its folder was kept: $dir"
      return
    }
  }
  if ($Keep) { Write-Log $logFile "Kept temporary folder (requested): $dir"; return }
  if (-not $state.Created) { return }
  if (-not (Test-OwnTempDir $state)) {
    Add-Failure $logFile "folder $dir failed the ownership checks (location/name/sentinel); NOT deleted"
    return
  }
  try {
    [System.IO.Directory]::Delete($dir, $true)
  } catch {
    Add-Failure $logFile "could not delete $dir : $($_.Exception.Message)"
    return
  }
  if (Test-Path -LiteralPath $dir) { Add-Failure $logFile "folder still present after delete: $dir" }
  else { Write-Log $logFile "Deleted this run's temporary folder: $dir" }
}

# ---------------------------------------------------------------- result

<# Prints an honest overall verdict and returns the process exit code (0 only if every step succeeded). #>
function Write-Result([string]$logFile, $exitTable, [string[]]$expectedSteps) {
  Write-Log $logFile ""
  Write-Log $logFile "Exit codes (0 = success):"
  foreach ($k in $exitTable.Keys) { Write-Log $logFile ("  {0,-38} {1}" -f $k, $exitTable[$k]) }
  $notRun = @($expectedSteps | Where-Object { -not $exitTable.Contains($_) })
  foreach ($s in $notRun) { Write-Log $logFile ("  {0,-38} NOT RUN" -f $s) }
  $nonZero = @($exitTable.Keys | Where-Object { $exitTable[$_] -ne 0 })
  Write-Log $logFile ""
  if ($script:Failures.Count -eq 0 -and $nonZero.Count -eq 0 -and $notRun.Count -eq 0) {
    Write-Log $logFile "RESULT: every step ran and exited 0."
    return 0
  }
  foreach ($f in $script:Failures) { Write-Log $logFile "  problem: $f" }
  if ($nonZero.Count) { Write-Log $logFile "  non-zero steps: $($nonZero -join ', ')" }
  if ($notRun.Count) { Write-Log $logFile "  steps not run: $($notRun -join ', ')" }
  Write-Log $logFile "RESULT: NOT COMPLETE - see the problems above. Nothing here is a pass."
  return 1
}
