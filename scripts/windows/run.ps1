# Keeps EasyReview running on the shop PC.
# Started at boot by the "EasyReview" scheduled task (see install.ps1).
# If the server exits or crashes it restarts 5 seconds later.
# While maintenance.flag exists (deploy.ps1 creates it) it waits instead.

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
New-Item -ItemType Directory -Force -Path "$root\logs" | Out-Null
$log = "$root\logs\app.log"

while ($true) {
    if (Test-Path "$root\maintenance.flag") {
        Start-Sleep -Seconds 5
        continue
    }

    # ponytail: single-file rotation at 10 MB, keeps one old copy (app.log.1).
    if ((Test-Path $log) -and ((Get-Item $log).Length -gt 10MB)) {
        Move-Item -Force $log "$log.1"
    }

    # cmd handles the redirect so the log stays plain text (PowerShell 5.1
    # would write UTF-16 and wrap stderr lines in error records).
    cmd /c "echo [%DATE% %TIME%] starting EasyReview >> `"$log`""
    cmd /c "node --disable-warning=ExperimentalWarning node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000 >> `"$log`" 2>&1"
    cmd /c "echo [%DATE% %TIME%] EasyReview exited with code $LASTEXITCODE >> `"$log`""

    Start-Sleep -Seconds 5
}
