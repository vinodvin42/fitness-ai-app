<#
  Shared helpers for the local verification scripts (16 Oct 2026).
  Dot-sourced by verify-batch0.ps1 and run-connectivity.ps1. Not run directly.

  Temporary PostgreSQL: uses the PostgreSQL binaries ALREADY installed on
  this PC (C:\Program Files\PostgreSQL\<version>\bin). It does not install
  anything, does not touch the existing PostgreSQL service or its data, and
  does not change Windows settings. It creates a brand-new data folder under
  %TEMP%, starts a server bound to 127.0.0.1 on a non-default port, and
  deletes the folder afterwards.
#>

$script:Secrets = New-Object System.Collections.Generic.List[string]

# npm.cmd avoids npm.ps1 and execution-policy differences on Windows.
$script:Npm = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
$script:Npx = if (Get-Command npx.cmd -ErrorAction SilentlyContinue) { "npx.cmd" } else { "npx" }

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
  # Any postgres URL credentials that slipped through
  return ($text -replace 'postgres(ql)?://[^@\s]+@', 'postgresql://[redacted]@')
}

function Write-Log([string]$logFile, [string]$line) {
  $safe = Protect-Text $line
  Add-Content -Path $logFile -Value $safe -Encoding utf8
  Write-Host $safe
}

<#
  Runs a command, streams redacted output to the console and the log,
  and returns the exit code. $cmd is an executable; $argList its arguments.
#>
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

function Find-PgBin {
  $root = "C:\Program Files\PostgreSQL"
  if (-not (Test-Path $root)) { return $null }
  $best = Get-ChildItem $root -Directory | Where-Object { Test-Path (Join-Path $_.FullName "bin\pg_ctl.exe") } |
    Sort-Object { [int]($_.Name -replace '[^0-9]', '') } -Descending | Select-Object -First 1
  if ($best) { return (Join-Path $best.FullName "bin") }
  return $null
}

function Test-PortFree([int]$port) {
  $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  return -not $inUse
}

<#
  Starts a throwaway PostgreSQL cluster. Returns a hashtable with
  DataDir, Port, User, Password, PgBin. The password exists only in memory
  and in this process's environment.
#>
function Start-TempPostgres([string]$logFile, [int]$port = 55432) {
  $pgBin = Find-PgBin
  if (-not $pgBin) { throw "No PostgreSQL binaries found under C:\Program Files\PostgreSQL. Nothing was installed." }
  if (-not (Test-PortFree $port)) { throw "Port $port is already in use. Pass -Port with a free port." }

  $dataDir = Join-Path $env:TEMP ("fynrox-temp-pg-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  $user = "fynrox_harness"
  $password = New-TestSecret "pg"
  $pwFile = Join-Path $env:TEMP ("fynrox-pw-" + [guid]::NewGuid().ToString("N") + ".txt")
  [IO.File]::WriteAllText($pwFile, $password)
  try {
    $code = Invoke-Logged $logFile "initdb (new, empty data folder in %TEMP%)" $env:TEMP (Join-Path $pgBin "initdb.exe") @(
      "-D", $dataDir, "-U", $user, "--pwfile=$pwFile", "--auth=scram-sha-256", "-E", "UTF8", "--no-instructions")
  } finally {
    Remove-Item $pwFile -Force -ErrorAction SilentlyContinue
  }
  if ($code -ne 0) { throw "initdb failed (exit $code)." }

  $pgLog = Join-Path $dataDir "server.log"
  $code = Invoke-Logged $logFile "start temporary server on 127.0.0.1:$port" $env:TEMP (Join-Path $pgBin "pg_ctl.exe") @(
    "-D", $dataDir, "-l", $pgLog, "-w", "-o", "-p $port -c listen_addresses=127.0.0.1", "start")
  if ($code -ne 0) { throw "pg_ctl start failed (exit $code). See $pgLog" }

  return @{ DataDir = $dataDir; Port = $port; User = $user; Password = $password; PgBin = $pgBin }
}

function New-TempDatabase([string]$logFile, $pg, [string]$name) {
  $env:PGPASSWORD = $pg.Password
  try {
    $code = Invoke-Logged $logFile "create database $name" $env:TEMP (Join-Path $pg.PgBin "createdb.exe") @(
      "-h", "127.0.0.1", "-p", "$($pg.Port)", "-U", $pg.User, $name)
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  if ($code -ne 0) { throw "createdb $name failed (exit $code)." }
  return "postgresql://$($pg.User):$($pg.Password)@127.0.0.1:$($pg.Port)/${name}?schema=public"
}

function Stop-TempPostgres([string]$logFile, $pg, [switch]$Keep) {
  if (-not $pg) { return }
  Invoke-Logged $logFile "stop temporary server" $env:TEMP (Join-Path $pg.PgBin "pg_ctl.exe") @("-D", $pg.DataDir, "-m", "fast", "-w", "stop") | Out-Null
  if ($Keep) {
    Write-Log $logFile "    kept data folder (requested): $($pg.DataDir)"
  } else {
    Remove-Item -Recurse -Force $pg.DataDir -ErrorAction SilentlyContinue
    Write-Log $logFile "    deleted data folder: $($pg.DataDir)"
  }
}

$script:ExternalVars = @("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SENTRY_DSN", "REDIS_URL",
      "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT",
      "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RENDER", "WEBSITE_SITE_NAME", "WEBSITE_INSTANCE_ID",
  "ADMIN_MFA_REQUIRED", "PAYMENT_PROVIDER", "FOOD_DATA_PROVIDER", "AI_PROVIDER", "FYNROX_CONNECTIVITY")

function Clear-ExternalEnv { foreach ($name in $script:ExternalVars) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue } }

function Set-BaseTestEnv([string]$databaseUrl) {
  $env:DATABASE_URL = $databaseUrl
  $env:NODE_ENV = "test"
  $env:API_INSTANCE_COUNT = "1"
  $env:CORS_ORIGINS = "http://localhost:5173"
  $env:JWT_ACCESS_SECRET = New-TestSecret "access"
  $env:JWT_REFRESH_SECRET = New-TestSecret "refresh"
  $env:ADMIN_JWT_SECRET = New-TestSecret "admin"
  $env:PROFESSIONAL_JWT_SECRET = New-TestSecret "pro"
  $env:GYM_JWT_SECRET = New-TestSecret "gym"
  $env:INFLUENCER_JWT_SECRET = New-TestSecret "influencer"
  $env:TWO_FACTOR_ENCRYPTION_KEY = New-HexKey64
  # Keep a developer's apps/api/.env out of the run.
  $env:DOTENV_CONFIG_PATH = Join-Path $env:TEMP "fynrox-no-dotenv-for-tests"
}

<# The project's own test suite: same variables CI sets (.github/workflows/ci.yml), nothing more. #>
function Set-ProjectTestEnv([string]$databaseUrl) {
  Clear-ExternalEnv
  Set-BaseTestEnv $databaseUrl
}

<# The connectivity harness: base variables plus deterministic local substitutes for every provider. #>
function Set-IsolatedTestEnv([string]$databaseUrl) {
  Clear-ExternalEnv
  Set-BaseTestEnv $databaseUrl
  $env:FYNROX_CONNECTIVITY = "1"
  $env:PAYMENT_PROVIDER = "mock"
  $env:FOOD_DATA_PROVIDER = "seed"
  $env:AI_PROVIDER = "mock"
  $env:RAZORPAY_WEBHOOK_SECRET = New-TestSecret "webhook"
}
