@echo off
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_VBS=%~dp0start-companion-background.vbs"

echo [Antigravity Mobile] Creating auto-start shortcut in Windows Startup folder...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_FOLDER%\AntigravityMobileDaemon.lnk'); $Shortcut.TargetPath = 'wscript.exe'; $Shortcut.Arguments = '\"%TARGET_VBS%\"'; $Shortcut.WindowStyle = 7; $Shortcut.Description = 'Antigravity Mobile Companion Always-Ready Daemon'; $Shortcut.Save()"

if %ERRORLEVEL% EQU 0 (
  echo [Antigravity Mobile] SUCCESS: Companion daemon will now start automatically on Windows login!
) else (
  echo [Antigravity Mobile] Could not write startup shortcut.
)
pause
