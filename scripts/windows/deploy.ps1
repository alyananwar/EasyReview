# Update EasyReview to the latest code and restart it.
# Run on the shop PC (over SSH from the Mac):
#   ssh shop-pc deploy
# Roll back to an earlier commit:
#   ssh shop-pc deploy -Ref a328673
# Just restart (after changing .env.local), no pull or rebuild:
#   ssh shop-pc deploy -RestartOnly
#
# Your .env.local, data\ (database + backups) and logs\ are git-ignored,
# so the reset below never touches them.

param(
    [string]$Ref = "origin/main",
    [switch]$RestartOnly
)

# "Continue", not "Stop": Windows PowerShell 5.1 can turn git's progress
# output on stderr into a terminating error. Steps are checked by exit code.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$flag = "$root\maintenance.flag"

function Invoke-Step([string]$name, [scriptblock]$cmd) {
    Write-Host "==> $name"
    $global:LASTEXITCODE = 0
    & $cmd
    if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

# Don't cut a batch off mid-send: wait up to 10 minutes for an active run.
# Single quotes only: PowerShell 5.1 mangles double quotes in native arguments.
$activeRunCheck = "const{DatabaseSync}=require('node:sqlite');" +
    "const d=new DatabaseSync('data/easyreview.db',{readOnly:true});" +
    "process.exit(d.prepare('SELECT 1 FROM runs WHERE status=?').get('running')?1:0)"
if (Test-Path "$root\data\easyreview.db") {
    for ($i = 0; $i -lt 60; $i++) {
        node --disable-warning=ExperimentalWarning -e $activeRunCheck
        if ($LASTEXITCODE -eq 0) { break }
        if ($i -eq 0) { Write-Host "==> Waiting for the current run to finish..." }
        Start-Sleep -Seconds 10
    }
}

$before = (git rev-parse --short HEAD)
New-Item -ItemType File -Force -Path $flag | Out-Null
try {
    Write-Host "==> Stopping server"
    Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

    if (-not $RestartOnly) {
        Invoke-Step "git fetch" { git fetch origin }
        Invoke-Step "git reset to $Ref" { git reset --hard $Ref }
        Invoke-Step "npm ci" { npm ci --no-audit --no-fund }
        Invoke-Step "npm run build" { npm run build }
    }
}
catch {
    Write-Host ""
    Write-Host "DEPLOY FAILED: $_" -ForegroundColor Red
    Write-Host "Server is restarting on whatever is in place now."
    Write-Host "To roll back to the version that was running before:"
    Write-Host "  deploy -Ref $before"
    Remove-Item -Force $flag
    exit 1
}

Remove-Item -Force $flag
Write-Host "==> Deployed $(git rev-parse --short HEAD) (was $before). Server restarts within 5 seconds."
Start-Sleep -Seconds 15
$health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/privacy" -TimeoutSec 10 -ErrorAction SilentlyContinue
if ($health.StatusCode -eq 200) { Write-Host "==> Server is up." }
else { Write-Host "==> Server not answering yet. Check: Get-Content logs\app.log -Tail 50" -ForegroundColor Yellow }
