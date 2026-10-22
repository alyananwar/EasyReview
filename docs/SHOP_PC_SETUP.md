# Shop PC Setup (Lockeford Garage)

EasyReview runs on the shop's Windows 11 desktop. You set it up once in person, then manage it from your Mac over SSH.

```
Shop PC (Windows 11)
  EasyReview (Node, 127.0.0.1:3000)  <- started at boot by the "EasyReview" task
    data\easyreview.db               <- SQLite: customers, runs, opt-outs, settings
    data\backups\                    <- daily copy, last 14 days
    logs\app.log
  Tailscale
    tailnet (you):  SSH + dashboard at https://<pc>.<tailnet>.ts.net
    Funnel (public): only /privacy, /terms, /api/twilio/webhook
        |                        |
  QuickBooks Online API     Twilio API      (outbound HTTPS only)
```

QuickBooks Online lives on Intuit's servers. The shop keeps using it in the browser like normal. EasyReview reads invoices through the API every 2 hours (9am to 5pm) and texts customers whose invoice is new.

Nothing gets port-forwarded on the shop router. SSH only accepts connections from your tailnet.

---

## Before the visit (on your Mac)

**1. Make an SSH key** (Mac Terminal). Skip this if `ls ~/.ssh/id_ed25519.pub` already shows a file.

```bash
ssh-keygen -t ed25519 -C "alyan-mac"
```

Copy `~/.ssh/id_ed25519.pub` to a USB stick. It's the public half, so it's safe to share.

**2. Install Tailscale on the Mac** (Mac Terminal), then sign in from the menu bar icon.

```bash
brew install --cask tailscale
```

**3. Generate secrets** (Mac Terminal). Run it twice and save both values for `.env.local`:

```bash
openssl rand -hex 32
```

One is `COOKIE_SECRET` and the other is `CRON_SECRET`. Pick a strong `DASHBOARD_PASSWORD` too.

**4. Fill in `.env.local` on the Mac.** Start from `.env.example`. You'll fill in `PUBLIC_URL` and `QUICKBOOKS_REDIRECT_URI` at the shop once you know the PC's Tailscale name. Don't email this file. You'll copy it over SSH.

**5. Push your latest code** (Mac Terminal, in the repo). The shop PC pulls from GitHub.

```bash
git push origin main
```

---

## At the shop (on the Windows PC)

Sign in to an **administrator** account on the PC. Your own local admin account is best, so the app doesn't depend on the shop's login. Run `whoami` and write down the user name after the backslash. That's your SSH user.

### Step 1: Install tools

Open **PowerShell as Administrator** (Start, type `powershell`, right-click, Run as administrator):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
winget install -e --id tailscale.tailscale
```

**Close PowerShell and open a new admin one** so the new tools are on PATH. Check:

```powershell
node -v    # must be v24 or newer
git --version
```

### Step 2: Join the tailnet

Sign in to Tailscale from the tray icon with **the same account as your Mac**. Then, on [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines):

1. Rename the PC to `lockeford-pc` (three-dot menu, Edit machine name).
2. Click **Disable key expiry** on it. Otherwise the PC drops off your tailnet after 180 days, and you lose remote access until someone signs in at the shop again.

Get its address (PC, admin PowerShell):

```powershell
(tailscale status --json | ConvertFrom-Json).Self.DNSName
```

It prints something like `lockeford-pc.tail1234.ts.net.`. Drop the trailing dot. Your `PUBLIC_URL` is `https://lockeford-pc.tail1234.ts.net`.

### Step 3: Get the code and build

PC, admin PowerShell:

```powershell
git clone https://github.com/alyananwar/EasyReview.git C:\EasyReview
cd C:\EasyReview
npm ci
npm run build
```

### Step 4: Install the service and SSH

Copy your `id_ed25519.pub` from the USB stick to `Downloads`, then (PC, admin PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File C:\EasyReview\scripts\windows\install.ps1 -PublicKeyFile $HOME\Downloads\id_ed25519.pub
```

This turns off sleep, installs the OpenSSH server (tailnet only), adds your key, adds the `deploy` command, and registers the **EasyReview** startup task. The app won't fully work until `.env.local` exists (next step), which is fine.

### Step 5: Turn on the public address (Funnel)

PC, admin PowerShell:

```powershell
tailscale funnel --bg 3000
```

The first time, it prints a link to enable HTTPS and Funnel for your tailnet. Open it, approve, then run the command again. `--bg` keeps it on across reboots.

### Step 6: Connect from your Mac

Add this to `~/.ssh/config` on the **Mac** (replace `YOURUSER` with the `whoami` name from earlier):

```
Host shop-pc
    HostName lockeford-pc
    User YOURUSER
```

Then (Mac Terminal, in the repo folder):

```bash
ssh shop-pc "hostname"                                # should print the PC's name, no password prompt
scp .env.local shop-pc:C:/EasyReview/.env.local       # copy your secrets over the encrypted link
ssh shop-pc "cd C:\EasyReview; npm run verify"        # checks keys, URLs, Twilio
ssh shop-pc deploy -RestartOnly                       # restart with the new .env.local
```

`npm run verify` should pass everything except anything you're still waiting on (Twilio before A2P, for example).

### Step 7: Lock SSH to keys only

Once `ssh shop-pc` works without a password, run this on the **PC** (admin PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File C:\EasyReview\scripts\windows\install.ps1 -DisablePasswordLogin
```

### Step 8: Power-loss recovery (BIOS)

Reboot into BIOS/UEFI (usually F2 or Del at boot) and set **Restore on AC Power Loss** (sometimes called "AC Recovery" or "After Power Failure") to **Power On**. That way the PC comes back by itself after an outage, and the startup task brings EasyReview back with it.

### Step 9: Check it from the outside

| From                                      | Open                                   | Expect                                  |
| ----------------------------------------- | -------------------------------------- | --------------------------------------- |
| Your Mac (on Tailscale)                   | `https://lockeford-pc.tail1234.ts.net` | Login page                              |
| Your phone on cellular, Tailscale **off** | `.../privacy`                          | Privacy page                            |
| Your phone on cellular, Tailscale **off** | `https://lockeford-pc.tail1234.ts.net` | "Not found" (dashboard is tailnet-only) |

### Step 10: Connect QuickBooks and test

On the dashboard, click **Connect QuickBooks** and have the owner sign in with the shop's QuickBooks login. This happens once. After that, EasyReview refreshes the connection by itself on every run.

Then click **Preview** to see who would get a text, and **Run Now** for a real run.

To give the shop a "Run Now" button, make a desktop shortcut on the PC to `https://lockeford-pc.tail1234.ts.net`. It works on the PC because the PC is on your tailnet.

---

## Day to day (from your Mac)

| Task                    | Command (Mac Terminal)                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Ship new code           | `git push`, then `ssh shop-pc deploy`                                                                                                       |
| Roll back               | `ssh shop-pc deploy -Ref <commit>` (deploy prints the previous commit if a build fails)                                                     |
| Watch logs              | `ssh shop-pc "Get-Content C:\EasyReview\logs\app.log -Tail 50 -Wait"`                                                                       |
| Health check            | `ssh shop-pc "curl.exe -s -H 'Authorization: Bearer <CRON_SECRET>' http://127.0.0.1:3000/api/health"`                                       |
| Trigger a run now       | `ssh shop-pc "curl.exe -s -H 'Authorization: Bearer <CRON_SECRET>' http://127.0.0.1:3000/api/cron"`                                         |
| Is the service running? | `ssh shop-pc "Get-ScheduledTask EasyReview \| Select State"`                                                                                |
| Change `.env.local` | Edit it on the Mac, `scp .env.local shop-pc:C:/EasyReview/.env.local`, then `ssh shop-pc deploy -RestartOnly` |
| Dashboard               | `https://lockeford-pc.tail1234.ts.net`                                                                                                      |

`deploy` waits for an in-progress run to finish before it restarts anything.

### Restore the database from a backup

PC (over SSH), replacing the date:

```powershell
cd C:\EasyReview
New-Item maintenance.flag                       # keeps the app from restarting
Get-NetTCPConnection -LocalPort 3000 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
Copy-Item data\easyreview.db data\easyreview.before-restore.db
Remove-Item data\easyreview.db-wal, data\easyreview.db-shm -ErrorAction SilentlyContinue
Copy-Item data\backups\easyreview-2026-11-01.db data\easyreview.db -Force
Remove-Item maintenance.flag                    # app restarts within 5 seconds
```

### If something breaks

| Symptom                                       | Fix                                                                                                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert text: "QuickBooks token refresh failed" | Open the dashboard and click **Connect QuickBooks** again. The refresh token lasts 100 days but renews on every run, so this only happens if the PC was off for months or someone revoked access in QuickBooks. |
| `ssh shop-pc` times out                       | The PC is off or Tailscale is signed out. Check the machine list at login.tailscale.com. Someone at the shop needs to turn the PC on.                                                                           |
| Dashboard shows "Not found" from your Mac     | Your Mac isn't on Tailscale, or it's a _tagged_ device (tagged devices don't send the user header). Turn Tailscale on.                                                                                          |
| STOP replies never show up on the dashboard   | `PUBLIC_URL` doesn't exactly match the Twilio webhook URL. Twilio still blocks the number either way.                                                                                                           |
| App keeps restarting                          | `ssh shop-pc "Get-Content C:\EasyReview\logs\app.log -Tail 80"`. A missing `.env.local` value (like `REVIEW_LINK`) stops it at startup.                                                                         |
