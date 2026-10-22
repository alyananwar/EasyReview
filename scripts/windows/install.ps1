#Requires -RunAsAdministrator
# One-time setup on the shop PC. Run from an *Administrator* PowerShell:
#   powershell -ExecutionPolicy Bypass -File C:\EasyReview\scripts\windows\install.ps1 -PublicKeyFile C:\Users\<you>\Downloads\id_ed25519.pub
#
# What it does (safe to re-run):
#   1. Stops the PC from sleeping or hibernating on AC power
#   2. Installs and starts the built-in OpenSSH Server, PowerShell as its shell
#   3. Adds your Mac's SSH key and only allows SSH from your tailnet (100.64.0.0/10)
#   4. Adds a "deploy" command for SSH sessions
#   5. Registers the "EasyReview" startup task that keeps the app running
#
# After you confirm key login works from the Mac, run again with
# -DisablePasswordLogin to turn off SSH password logins.

param(
    [string]$PublicKeyFile,
    [switch]$DisablePasswordLogin
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$user = "$env:USERDOMAIN\$env:USERNAME"

Write-Host "==> Power: never sleep or hibernate on AC"
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Write-Host "==> OpenSSH Server"
$cap = Get-WindowsCapability -Online -Name "OpenSSH.Server*"
if ($cap.State -ne "Installed") { Add-WindowsCapability -Online -Name $cap.Name | Out-Null }
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
    -Value "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -PropertyType String -Force | Out-Null

Write-Host "==> Firewall: SSH from tailnet only"
$rule = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
if ($rule) {
    Set-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -RemoteAddress "100.64.0.0/10"
} else {
    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (tailnet only)" `
        -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow -RemoteAddress "100.64.0.0/10" | Out-Null
}

if ($PublicKeyFile) {
    Write-Host "==> Adding SSH key from $PublicKeyFile"
    # Admin accounts read keys from here, not from ~\.ssh\authorized_keys.
    $keys = "$env:ProgramData\ssh\administrators_authorized_keys"
    $key = (Get-Content $PublicKeyFile -Raw).Trim()
    if (-not (Test-Path $keys) -or -not ((Get-Content $keys -Raw) -like "*$key*")) {
        Add-Content -Path $keys -Value $key -Encoding ascii
    }
    # sshd ignores the file unless only Administrators and SYSTEM can access it.
    # (SIDs: Administrators, SYSTEM; group names differ on non-English Windows.)
    icacls.exe $keys /inheritance:r /grant "*S-1-5-32-544:F" /grant "*S-1-5-18:F" | Out-Null
}

if ($DisablePasswordLogin) {
    Write-Host "==> Disabling SSH password login"
    $cfg = "$env:ProgramData\ssh\sshd_config"
    $text = Get-Content $cfg -Raw
    $text = $text -replace "(?m)^#?\s*PasswordAuthentication\s+\w+", "PasswordAuthentication no"
    if ($text -notmatch "(?m)^PasswordAuthentication no") { $text = "PasswordAuthentication no`r`n" + $text }
    Set-Content -Path $cfg -Value $text -Encoding ascii
    Restart-Service sshd
}

Write-Host "==> 'deploy' command for SSH sessions"
$profileDir = Split-Path -Parent $PROFILE.CurrentUserAllHosts
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
$line = "function deploy { & `"$root\scripts\windows\deploy.ps1`" @args }"
if (-not (Test-Path $PROFILE.CurrentUserAllHosts) -or
    -not ((Get-Content $PROFILE.CurrentUserAllHosts -Raw) -like "*deploy.ps1*")) {
    Add-Content -Path $PROFILE.CurrentUserAllHosts -Value $line
}
# Let the profile and the EasyReview scripts run for this user.
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force

Write-Host "==> EasyReview startup task (runs as $user, logged in or not)"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\scripts\windows\run.ps1`""
$trigger = New-ScheduledTaskTrigger -AtStartup
# S4U = runs without anyone logged in and without storing your password.
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "EasyReview" -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "EasyReview"

Write-Host ""
Write-Host "Done. EasyReview is starting on http://127.0.0.1:3000 (log: $root\logs\app.log)."
Write-Host "Next: tailscale funnel --bg 3000   (see docs\SHOP_PC_SETUP.md step 6)"
