<#
  Batch 0 dependency reconciliation and real project checks (16 Oct 2026).

  Run from the root of the branch clone (D:\repo\fitness-ai-app-blueprint),
  on a machine that can reach the npm registry:
    powershell -ExecutionPolicy Bypass -File scripts\local-verify\verify-batch0.ps1
  Optional: -SkipBaseline (no comparison with main), -Port 55433

  Steps and their side effects:
    1. Records git branch/HEAD/status (names only), node and npm versions.
    2. npm install --package-lock-only    -> rewrites package-lock.json (font entry)
    3. npm ci                             -> creates node_modules (downloads from npm)
    4. If apps/user-mobile has no expo-system-ui:
       npx expo install expo-system-ui    -> Expo SDK 51 picks the version; edits
                                             apps/user-mobile/package.json + package-lock.json
    5. Explains every lockfile change (lockfile-changes.txt). Stops if Expo,
       React Native or React changed; flags any other existing package whose
       version moved.
    6. Deletes node_modules and runs npm ci again -> proves the final lockfile
       installs cleanly.
    7. npm run typecheck, npm run lint
    8. Temporary PostgreSQL (existing PostgreSQL binaries, new folder in %TEMP%,
       127.0.0.1 only) -> migrations applied to a throwaway database ->
       npm run test --workspace=apps/api (JUnit results)
    9. Unless -SkipBaseline: the same typecheck/lint/tests on origin/main in a
       temporary git worktree (its own npm ci, its own throwaway database),
       then a comparison: new failures vs failures that already exist on main.
   10. Stops the temporary server, deletes its folder and the worktree.

  Leaves package-lock.json / apps/user-mobile/package.json changes UNCOMMITTED
  for you to review. Does not push, deploy, or contact Azure/Render.
  Results: test-results\local-verify\<time>\ (run-log.txt has every command,
  exit code and redacted output).
#>
param(
  [switch]$SkipBaseline,
  [int]$Port = 55433
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $repo "test-results\local-verify\$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$log = Join-Path $out "run-log.txt"
Set-Content -Path $log -Value "FynroX Batch 0 verification $(Get-Date -Format o)" -Encoding utf8

$exit = [ordered]@{}
$pg = $null
$worktree = $null
$notes = New-Object System.Collections.Generic.List[string]

function Step([string]$key, [string]$title, [string]$dir, [string]$cmd, [string[]]$a) {
  $code = Invoke-Logged $log $title $dir $cmd $a
  $exit[$key] = $code
  return $code
}

function Remove-NodeModules([string]$root) {
  # Only the workspace install locations npm ci recreates; never anything else.
  $targets = @(Join-Path $root "node_modules")
  foreach ($group in @("apps", "packages")) {
    $dir = Join-Path $root $group
    if (Test-Path $dir) { Get-ChildItem $dir -Directory | ForEach-Object { $targets += (Join-Path $_.FullName "node_modules") } }
  }
  foreach ($t in $targets) { if (Test-Path $t) { Write-Log $log "    removing $t"; Remove-Item -Recurse -Force $t } }
}

function Invoke-ProjectChecks([string]$label, [string]$root, [string]$dbName) {
  Step "$label typecheck" "[$label] npm run typecheck" $root $script:Npm @("run", "typecheck") | Out-Null
  Step "$label lint" "[$label] npm run lint" $root $script:Npm @("run", "lint") | Out-Null
  $url = New-TempDatabase $log $pg $dbName
  Set-ProjectTestEnv $url
  Step "$label prisma generate" "[$label] prisma generate" $root $script:Npm @("run", "db:generate", "--workspace=apps/api") | Out-Null
  $m = Step "$label migrate (throwaway db)" "[$label] prisma migrate deploy on the throwaway database" $root $script:Npm @("run", "db:deploy", "--workspace=apps/api")
  if ($m -ne 0) { $notes.Add("[$label] migrations failed on the throwaway database; tests not run."); return $null }
  $junit = Join-Path $root "apps\api\test-results\api-junit.xml"
  if (Test-Path $junit) { Remove-Item $junit -Force }
  Step "$label api tests" "[$label] npm run test (apps/api)" $root $script:Npm @("run", "test", "--workspace=apps/api", "--", "--reporter=default", "--reporter=junit", "--outputFile.junit=test-results/api-junit.xml") | Out-Null
  Clear-ExternalEnv
  if (Test-Path $junit) {
    $copy = Join-Path $out "$label-junit.xml"
    Copy-Item $junit $copy
    return $copy
  }
  $notes.Add("[$label] no JUnit file was produced.")
  return $null
}

try {
  # 1. record
  foreach ($c in @("git", "node", $script:Npm)) { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "$c is not on PATH." } }
  Write-Log $log "node $(node --version); npm $(& $script:Npm --version)"
  Write-Log $log "branch $(git -C $repo branch --show-current); HEAD $(git -C $repo rev-parse HEAD)"
  git -C $repo status --porcelain=v1 | ForEach-Object { Write-Log $log "  status: $_" }

  # 2-3. reconcile lockfile, install
  $lockBefore = Join-Path $out "package-lock.before.json"
  Copy-Item (Join-Path $repo "package-lock.json") $lockBefore
  if ((Step "lockfile reconcile" "npm install --package-lock-only" $repo $script:Npm @("install", "--package-lock-only", "--no-audit", "--no-fund")) -ne 0) { throw "lockfile reconciliation failed" }
  if ((Step "npm ci (1)" "npm ci (installs node_modules, needed for the Expo CLI)" $repo $script:Npm @("ci", "--no-audit", "--no-fund")) -ne 0) { throw "npm ci failed after lockfile reconciliation" }

  # 4. expo-system-ui
  $mobilePkg = Get-Content -Raw (Join-Path $repo "apps\user-mobile\package.json") | ConvertFrom-Json
  $hasSystemUi = $mobilePkg.dependencies.PSObject.Properties.Name -contains "expo-system-ui"
  if ($hasSystemUi) {
    Write-Log $log "expo-system-ui already declared ($($mobilePkg.dependencies.'expo-system-ui')); not installing."
  } else {
    if ((Step "expo install expo-system-ui" "npx expo install expo-system-ui (Expo SDK 51 resolution)" (Join-Path $repo "apps\user-mobile") $script:Npx @("expo", "install", "expo-system-ui")) -ne 0) { throw "expo install failed" }
  }

  # 5. explain lockfile changes
  $diffCode = Step "lockfile explanation" "Explain lockfile changes" $repo "node" @((Join-Path $PSScriptRoot "lockfile-diff.mjs"), $lockBefore, (Join-Path $repo "package-lock.json"), (Join-Path $out "lockfile-changes.txt"))
  if ($diffCode -eq 3) { throw "Expo, React Native or React changed version. Stopping. See lockfile-changes.txt." }
  if ($diffCode -eq 2) { $notes.Add("Some existing packages changed version: each needs an explanation (lockfile-changes.txt).") }

  # 6. clean install proof
  Write-Log $log ""
  Write-Log $log "=== removing node_modules for a clean install"
  Remove-NodeModules $repo
  if ((Step "npm ci (clean)" "npm ci from a clean tree with the final lockfile" $repo $script:Npm @("ci", "--no-audit", "--no-fund")) -ne 0) { throw "clean npm ci failed with the final lockfile" }

  # 7-8. project checks on the branch
  $pg = Start-TempPostgres $log $Port
  $branchJunit = Invoke-ProjectChecks "branch" $repo "fynrox_branch_tests_test"

  # 9. baseline on main
  if (-not $SkipBaseline) {
    $worktree = Join-Path $env:TEMP "fynrox-main-baseline-$stamp"
    if ((Step "baseline worktree" "git worktree add (origin/main, detached)" $repo "git" @("worktree", "add", "--detach", $worktree, "origin/main")) -eq 0) {
      if ((Step "baseline npm ci" "[main] npm ci" $worktree $script:Npm @("ci", "--no-audit", "--no-fund")) -eq 0) {
        $mainJunit = Invoke-ProjectChecks "main" $worktree "fynrox_main_tests_test"
      } else {
        $notes.Add("[main] npm ci failed; no baseline.")
      }
    }
    Step "test comparison" "Compare branch vs main test results" $repo "node" @((Join-Path $PSScriptRoot "junit-compare.mjs"), "$branchJunit", "$mainJunit", (Join-Path $out "test-comparison.txt")) | Out-Null
  } else {
    $notes.Add("Baseline skipped: failures cannot be separated into pre-existing vs new.")
  }
}
catch {
  Write-Log $log ""
  Write-Log $log "STOPPED: $($_.Exception.Message)"
}
finally {
  Stop-TempPostgres $log $pg
  if ($worktree -and (Test-Path $worktree)) {
    Invoke-Logged $log "remove baseline worktree" $repo "git" @("worktree", "remove", "--force", $worktree) | Out-Null
  }
  Clear-ExternalEnv
  Write-Log $log ""
  Write-Log $log "Exit codes (0 = success):"
  foreach ($k in $exit.Keys) { Write-Log $log ("  {0,-34} {1}" -f $k, $exit[$k]) }
  foreach ($n in $notes) { Write-Log $log "NOTE: $n" }
  Write-Log $log ""
  Write-Log $log "Results folder: $out"
  Write-Log $log "Review, then decide yourself whether to commit: git -C $repo diff -- package.json package-lock.json apps/user-mobile/package.json"
}
