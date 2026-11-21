@echo off
rem Run ONLY after the Mac connects with "ssh shop-pc" and no password prompt.
rem Turns off SSH password logins so only your Mac's key works.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -NoExit -ExecutionPolicy Bypass -File C:\EasyReview\scripts\windows\install.ps1 -DisablePasswordLogin'"
