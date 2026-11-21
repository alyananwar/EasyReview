EasyReview shop PC setup
========================

No passwords or API keys are on this stick. Those go from the Mac over SSH.
Everything installs under the shop's normal Windows login. That login has to be
an administrator.

1. Sign in to the shop PC with its normal login. Open this USB stick and
   double-click 1-setup.cmd. Click Yes on the admin prompt.
   It installs Node, Git and Tailscale, connects Tailscale (sign in with YOUR
   Tailscale account, same as the Mac), downloads and builds EasyReview,
   installs the service and SSH, and turns on Funnel.
   When it pauses, it tells you exactly what to click. Press Enter after.
   If it stops with a red message, fix that and run it again. Done steps are skipped.

2. On the Mac: tell Claude "shop PC is ready" plus the SSH user the script printed
   (also saved to ssh-user.txt on this stick). It copies the settings over and
   checks everything.

3. Optional: double-click 2-lock-ssh.cmd (turns off SSH password logins).

4. Restart the PC, press F2 or Del while it boots, and set
   "Restore on AC Power Loss" to "Power On". Save and exit.

Full guide: C:\EasyReview\docs\SHOP_PC_SETUP.md
