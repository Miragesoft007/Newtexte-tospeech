@echo off
chcp 65001 >nul
title AudioVox — VoxCPM2

echo.
echo ══════════════════════════════════════════════
echo   AudioVox — Lecteur FR/AR avec VoxCPM2
echo   http://localhost:7860
echo ══════════════════════════════════════════════
echo.

if not exist ".venv\Scripts\activate.bat" (
    echo [ERREUR] Lancez d'abord : install_windows.bat
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat

if not exist "gradio_app.py" (
    echo [ERREUR] gradio_app.py introuvable.
    pause
    exit /b 1
)

if not exist "audio"   mkdir audio
if not exist "uploads" mkdir uploads
if not exist "voices"  mkdir voices

echo Demarrage de l'application...
echo Le navigateur va s'ouvrir automatiquement.
echo.
echo [IMPORTANT] Ne fermez pas cette fenetre !
echo Pour arreter : CTRL+C
echo.

start "" cmd /c "timeout /t 5 >nul && start http://localhost:7860"

python gradio_app.py --port 7860

pause
