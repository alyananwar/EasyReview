# EasyReview shop PC setup. Start it by double-clicking 1-setup.cmd on the USB stick.
# Safe to re-run: every step checks whether it's already done and skips it.
#
# Run it from the shop's normal Windows login (it must be an administrator).
# Installs Node/Git/Tailscale, joins your tailnet, downloads and builds EasyReview,
# installs the service + SSH for this same account, and turns on Funnel.

$ErrorActionPreference = "Continue"
$Tailnet = "tail2f4cd7.ts.net"
$Machine = "lockeford-pc"
$Repo    = "https://github.com/alyananwar/EasyReview.git"
$AppDir  = "C:\EasyReview"
$KeyFile = Join-Path $PSScriptRoot "id_ed25519.pub"
$TsExe   = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"

# Re-launch as administrator if needed (Windows shows a Yes/No prompt).
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -NoExit -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

function Step([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Fail([string]$msg) {
    Write-Host ""
    Write-Host "STOPPED: $msg" -ForegroundColor Red
    Write-Host "Fix that, then double-click 1-setup.cmd again. Finished steps get skipped."
    exit 1
}

function Run([string]$name, [scriptblock]$cmd) {
    $global:LASTEXITCODE = 0
    & $cmd
    if ($LASTEXITCODE -ne 0) { Fail "$name failed (exit $LASTEXITCODE)" }
}

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
}

function Get-TsStatus {
    (& $TsExe status --json | Out-String) | ConvertFrom-Json
}

function Wait-Enter([string]$msg) {
    Write-Host $msg -ForegroundColor Yellow
    return (Read-Host "Press Enter when done (or type skip)")
}

if (-not (Test-Path $KeyFile)) { Fail "id_ed25519.pub is missing from the USB folder ($PSScriptRoot)." }

# The app, the startup task and SSH all belong to whoever runs this, so it has to be
# the shop's own account. If Windows asked for a *different* admin login at the Yes/No
# prompt, everything would end up under that other account instead.
$console = (Get-CimInstance Win32_ComputerSystem).UserName
if ($console -and ($console -ne $identity.Name)) {
    Fail "Running as $($identity.Name), but the signed-in account is $console. Make $console an administrator (Settings > Accounts > Other users, or ask whoever manages the PC), then run again."
}
$sshUser = $env:USERNAME
Set-Content -Path (Join-Path $PSScriptRoot "ssh-user.txt") -Value $sshUser -Encoding ascii -ErrorAction SilentlyContinue
Write-Host "Setting up EasyReview under this account: $sshUser" -ForegroundColor Green

Step "Installing Node.js, Git and Tailscale"
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    # New accounts sometimes don't have winget registered yet.
    Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction SilentlyContinue
}
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Fail "winget is missing. Open Microsoft Store, search 'App Installer', click Update, then run again."
}
Refresh-Path
$tools = @(
    @{ Id = "OpenJS.NodeJS.LTS";   Ready = { Get-Command node -ErrorAction SilentlyContinue } },
    @{ Id = "Git.Git";             Ready = { Get-Command git -ErrorAction SilentlyContinue } },
    @{ Id = "tailscale.tailscale"; Ready = { Test-Path $TsExe } }
)
foreach ($t in $tools) {
    if (& $t.Ready) { Write-Host "  $($t.Id) already installed"; continue }
    Write-Host "  Installing $($t.Id)..."
    winget install -e --id $t.Id --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (-not (& $t.Ready)) { Fail "$($t.Id) didn't install. Scroll up for winget's error." }
}
$nodeVersion = (node -v)
$nodeMajor = [int]($nodeVersion.TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 24) { Fail "Node $nodeVersion is too old (need v24+). Run: winget upgrade -e --id OpenJS.NodeJS.LTS" }
Write-Host "  Node $nodeVersion, $(git --version)"

Step "Connecting Tailscale (sign in with YOUR account, the same one as your Mac)"
$st = Get-TsStatus
if ($st.BackendState -ne "Running") {
    Write-Host "  A sign-in page should open. If it doesn't, open the link printed below."
    & $TsExe up --unattended --hostname=$Machine
    Start-Sleep -Seconds 3
    $st = Get-TsStatus
    if ($st.BackendState -ne "Running") { Fail "Tailscale isn't connected (state: $($st.BackendState)). Sign in from the Tailscale tray icon." }
}

$want = "$Machine.$Tailnet."
while ($true) {
    $dns = (Get-TsStatus).Self.DNSName
    if ($dns -eq $want) { Write-Host "  This PC is $($want.TrimEnd('.'))"; break }
    if ($dns -notlike "*.$Tailnet.") {
        Fail "Tailscale is signed in to a different account ($dns). Tray icon > Log out, then run again and sign in with your account."
    }
    $null = Wait-Enter "  This PC shows up as '$dns'. On login.tailscale.com/admin/machines, rename it to exactly '$Machine' (three dots > Edit machine name)."
}

while ($true) {
    $prefs = (& $TsExe debug prefs | Out-String) | ConvertFrom-Json
    if ($prefs.ForceDaemon) { Write-Host "  Run unattended: on"; break }
    if ((Wait-Enter "  Turn on Run unattended: Tailscale tray icon (bottom right, by the clock) > Preferences > Run unattended.") -eq "skip") { break }
}

while ($true) {
    if (-not (Get-TsStatus).Self.KeyExpiry) { Write-Host "  Key expiry: disabled"; break }
    if ((Wait-Enter "  On login.tailscale.com/admin/machines, open the three dots next to '$Machine' and click Disable key expiry.") -eq "skip") { break }
}

$taskExists = Get-ScheduledTask -TaskName "EasyReview" -ErrorAction SilentlyContinue
if ((Test-Path "$AppDir\.git") -and $taskExists) {
    Step "EasyReview already installed: updating with deploy"
    & "$AppDir\scripts\windows\deploy.ps1"
    if ($LASTEXITCODE -ne 0) { Fail "deploy failed. Scroll up for the error." }
} else {
    Step "Downloading EasyReview"
    if (Test-Path "$AppDir\.git") {
        Run "git fetch" { git -C $AppDir fetch origin }
        Run "git reset" { git -C $AppDir reset --hard origin/main }
    } else {
        Run "git clone" { git clone $Repo $AppDir }
    }
    Set-Location $AppDir
    Step "Installing packages and building (takes a few minutes)"
    Run "npm ci" { npm.cmd ci --no-audit --no-fund }
    Run "npm run build" { npm.cmd run build }
}

Step "Installing the EasyReview service and SSH"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$AppDir\scripts\windows\install.ps1" -PublicKeyFile $KeyFile
if ($LASTEXITCODE -ne 0) { Fail "install.ps1 failed. Scroll up for the error." }

Step "Turning on the public address (Funnel)"
while ($true) {
    & $TsExe funnel --bg 3000
    $funnel = (& $TsExe funnel status | Out-String)
    if ($funnel -match "Funnel on") { Write-Host "  Funnel is on"; break }
    if ((Wait-Enter "  If a link was printed above, open it and approve HTTPS + Funnel.") -eq "skip") { break }
}

Write-Host ""
Write-Host "PC setup done." -ForegroundColor Green
Write-Host "SSH user for the Mac: $sshUser  (also saved to ssh-user.txt on this USB stick)" -ForegroundColor Green
Write-Host "Next, on your Mac: tell Claude 'shop PC is ready, SSH user is $sshUser'."
Write-Host "Optional, after the Mac connects with no password prompt: double-click 2-lock-ssh.cmd."
Write-Host "Then restart the PC, press F2 or Del during boot, and set 'Restore on AC Power Loss' to Power On."
