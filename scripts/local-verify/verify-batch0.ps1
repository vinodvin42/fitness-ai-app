<#
  Batch 0 dependency reconciliation and real project checks (16 Oct 2026).
  USER-RUN ONLY, from the root of the branch clone, on a machine that can
  reach the npm registry:

    powershell -ExecutionPolicy Bypass -File scripts\local-verify\verify-batch0.ps1
    Optional: -SkipBaseline   -Port 55433

  Commands, in order (each logged with its exit code; output redacted):
    1. git branch/HEAD/status (file names only); node --version; npm --version
    2. npm install --package-lock-only --no-audit --no-fund
         side effect: rewrites package-lock.json (adds the Inter font entry)
    3. npm ci --no-audit --no-fund
         side effect: replaces node_modules (npm removes the old one itself)
    4. only if apps/user-mobile/package.json lacks expo-system-ui:
       (in apps\user-mobile) npx expo install expo-system-ui
         side effect: Expo SDK 51 picks the version; edits apps/user-mobile/package.json and package-lock.json
    5. node scripts\local-verify\lockfile-diff.mjs <before> package-lock.json <out>
         STOPS if Expo / React Native / React changed; flags any other moved version
    6. npm ci --no-audit --no-fund   (proves the FINAL lockfile installs cleanly)
    7. npm run typecheck ; npm run lint
    8. temporary PostgreSQL (safeguards in _common.ps1), database fynrox_branch_tests_test:
       npm run db:generate / db:deploy / test --workspace=apps/api  (JUnit)
    9. unless -SkipBaseline: the same checks on the branch's merge-base with
       origin/main, in a temporary git worktree (%TEMP%\fynrox-baseline-<runId>,
       its own npm ci and database fynrox_baseline_tests_test), then
       node scripts\local-verify\junit-compare.mjs  -> new vs pre-existing failures
   10. pg_ctl stop (this run's instance); delete its folder after ownership checks;
       git worktree remove for the exact baseline folder created in step 9.

  Setup/infrastructure failures stop the run. Check failures (typecheck,
  lint, tests) are recorded and the run continues so all results are
  captured; the final exit code is non-zero if anything failed or did not run.
  Leaves package-lock.json / apps/user-mobile/package.json changes UNCOMMITTED.
  Results: test-results\local-verify\<runId>\. Does not push or deploy.
#>
param(
  [switch]$SkipBaseline,
  [int]$Port = 55433
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$out = Join-Path $repo "test-results\local-verify\$($script:RunId)"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$log = Join-Path $out "run-log.txt"
Set-Content -Path $log -Value "FynroX Batch 0 verification $($script:RunId) $(Get-Date -Format o)" -Encoding utf8

$steps = @("lockfile reconcile", "npm ci (1)", "lockfile explanation", "npm ci (final lockfile)",
  "branch typecheck", "branch lint", "branch prisma generate", "branch migrate (throwaway db)", "branch api tests")
if (-not $SkipBaseline) {
  $steps += @("baseline worktree", "baseline npm ci", "baseline typecheck", "baseline lint", "baseline prisma generate",
    "baseline migrate (throwaway db)", "baseline api tests", "test comparison")
}
$exit = [ordered]@{}
$pg = @{}
$worktree = $null
$worktreeCreated = $false

function Step([string]$key, [string]$title, [string]$dir, [string]$cmd, [string[]]$a) {
  $code = Invoke-Logged $log $title $dir $cmd $a
  $exit[$key] = $code
  return $code
}

function Invoke-ProjectChecks([string]$label, [string]$root, [string]$dbName) {
  Step "$label typecheck" "[$label] npm run typecheck" $root $script:Npm @("run", "typecheck") | Out-Null
  Step "$label lint" "[$label] npm run lint" $root $script:Npm @("run", "lint") | Out-Null
  $url = New-TempDatabase $log $pg $dbName
  Set-ProjectTestEnv $url
  try {
    if ((Step "$label prisma generate" "[$label] prisma generate" $root $script:Npm @("run", "db:generate", "--workspace=apps/api")) -ne 0) { throw "[$label] prisma generate failed" }
    if ((Step "$label migrate (throwaway db)" "[$label] prisma migrate deploy on the throwaway database" $root $script:Npm @("run", "db:deploy", "--workspace=apps/api")) -ne 0) { throw "[$label] migrations failed on the throwaway database" }
    $junit = Join-Path $root "apps\api\test-results\api-junit.xml"
    if (Test-Path -LiteralPath $junit) { Remove-Item -LiteralPath $junit -Force }
    Step "$label api tests" "[$label] npm run test (apps/api)" $root $script:Npm @("run", "test", "--workspace=apps/api", "--", "--reporter=default", "--reporter=junit", "--outputFile.junit=test-results/api-junit.xml") | Out-Null
    if (-not (Test-Path -LiteralPath $junit)) { Add-Failure $log "[$label] no JUnit file was produced"; return $null }
    $copy = Join-Path $out "$label-junit.xml"
    Copy-Item -LiteralPath $junit -Destination $copy
    return $copy
  } finally {
    Clear-RunEnv
  }
}

try {
  # 1. record
  foreach ($c in @("git", "node", $script:Npm)) { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "$c is not on PATH." } }
  Assert-NoDotenvFiles $repo
  Write-Log $log "node $(node --version); npm $(& $script:Npm --version)"
  Write-Log $log "repo $repo; branch $(git -C $repo branch --show-current); HEAD $(git -C $repo rev-parse HEAD)"
  git -C $repo status --porcelain=v1 | ForEach-Object { Write-Log $log "  status: $_" }

  # 2-3. reconcile the lockfile, install
  $lockBefore = Join-Path $out "package-lock.before.json"
  Copy-Item -LiteralPath (Join-Path $repo "package-lock.json") -Destination $lockBefore
  if ((Step "lockfile reconcile" "npm install --package-lock-only" $repo $script:Npm @("install", "--package-lock-only", "--no-audit", "--no-fund")) -ne 0) { throw "lockfile reconciliation failed" }
  if ((Step "npm ci (1)" "npm ci (installs node_modules; needed for the Expo CLI)" $repo $script:Npm @("ci", "--no-audit", "--no-fund")) -ne 0) { throw "npm ci failed after lockfile reconciliation" }

  # 4. expo-system-ui, only if missing
  $mobilePkg = Get-Content -Raw -LiteralPath (Join-Path $repo "apps\user-mobile\package.json") | ConvertFrom-Json
  if ($mobilePkg.dependencies.PSObject.Properties.Name -contains "expo-system-ui") {
    Write-Log $log "expo-system-ui already declared ($($mobilePkg.dependencies.'expo-system-ui')); not installing."
  } else {
    $steps += "expo install expo-system-ui"
    if ((Step "expo install expo-system-ui" "npx expo install expo-system-ui (Expo SDK 51 resolution)" (Join-Path $repo "apps\user-mobile") $script:Npx @("expo", "install", "expo-system-ui")) -ne 0) { throw "expo install failed" }
  }

  # 5. explain lockfile changes
  $diffCode = Step "lockfile explanation" "Explain lockfile changes" $repo "node" @((Join-Path $PSScriptRoot "lockfile-diff.mjs"), $lockBefore, (Join-Path $repo "package-lock.json"), (Join-Path $out "lockfile-changes.txt"))
  if ($diffCode -eq 3) { throw "Expo, React Native or React changed version. Stopping. See lockfile-changes.txt." }
  if ($diffCode -eq 2) { $exit["lockfile explanation"] = 0; Write-Log $log "NOTE: some existing packages changed version; each needs an explanation (lockfile-changes.txt)." ; $script:Failures.Add("existing packages changed version - investigate lockfile-changes.txt") }
  elseif ($diffCode -ne 0) { throw "lockfile-diff.mjs failed (exit $diffCode)" }

  # 6. clean install with the final lockfile (npm ci removes node_modules itself)
  if ((Step "npm ci (final lockfile)" "npm ci with the final lockfile" $repo $script:Npm @("ci", "--no-audit", "--no-fund")) -ne 0) { throw "npm ci failed with the final lockfile" }

  # 7-8. project checks on the branch
  Start-TempPostgres $log $Port $pg
  $branchJunit = Invoke-ProjectChecks "branch" $repo "fynrox_branch_tests_test"

  # 9. baseline: the commit this branch started from
  if (-not $SkipBaseline) {
    $base = (git -C $repo merge-base HEAD origin/main).Trim()
    Write-Log $log "Baseline commit (merge-base with origin/main): $base"
    $worktree = Join-Path ([System.IO.Path]::GetFullPath($env:TEMP)) "fynrox-baseline-$($script:RunId)"
    if (Test-Path -LiteralPath $worktree) { throw "BLOCKER: $worktree already exists." }
    if ((Step "baseline worktree" "git worktree add --detach (merge-base)" $repo "git" @("worktree", "add", "--detach", $worktree, $base)) -ne 0) { throw "could not create the baseline worktree" }
    $worktreeCreated = $true
    if ((Step "baseline npm ci" "[baseline] npm ci" $worktree $script:Npm @("ci", "--no-audit", "--no-fund")) -ne 0) { throw "[baseline] npm ci failed" }
    $baseJunit = Invoke-ProjectChecks "baseline" $worktree "fynrox_baseline_tests_test"
    $cmpCode = Step "test comparison" "Compare branch vs baseline test results" $repo "node" @((Join-Path $PSScriptRoot "junit-compare.mjs"), "$branchJunit", "$baseJunit", (Join-Path $out "test-comparison.txt"))
    if ($cmpCode -eq 1) { Write-Log $log "NOTE: the branch has NEW test failures (test-comparison.txt)." }
  } else {
    $script:Failures.Add("baseline skipped: failures cannot be separated into pre-existing vs new")
  }
}
catch {
  Add-Failure $log "STOPPED: $($_.Exception.Message)"
}
finally {
  Stop-TempPostgres $log $pg
  if ($worktreeCreated -and $worktree -and (Test-Path -LiteralPath $worktree)) {
    # git removes only the worktree it registered at exactly this path.
    $rc = Invoke-Logged $log "git worktree remove (this run's baseline folder only)" $repo "git" @("worktree", "remove", "--force", $worktree)
    if ($rc -ne 0) { Add-Failure $log "baseline worktree not removed: $worktree (remove it with: git worktree remove --force `"$worktree`")" }
  }
  Clear-RunEnv
  $code = Write-Result $log $exit $steps
  Write-Log $log "Results folder: $out"
  Write-Log $log "Review before committing anything: git -C `"$repo`" diff -- package-lock.json apps/user-mobile/package.json"
}
exit $code
