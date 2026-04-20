@echo off
chcp 65001 >nul
title AudioVox — Lecteur de livres FR/AR

echo.
echo ══════════════════════════════════════════════
echo   AudioVox — Lecteur de livres FR/AR
echo   http://localhost:8000
echo ══════════════════════════════════════════════
echo.

:: ── Vérifier l'installation ─────────────────────
if not exist ".venv\Scripts\activate.bat" (
    echo [ERREUR] L'application n'est pas installee !
    echo Lancez d'abord : install_windows.bat
    echo.
    pause
    exit /b 1
)

:: ── Activer le venv ─────────────────────────────
call .venv\Scripts\activate.bat

:: ── Vérifier Python ─────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Python introuvable. Verifiez l'installation.
    pause
    exit /b 1
)

:: ── Vérifier espeak-ng ──────────────────────────
espeak-ng --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] espeak-ng introuvable !
    echo Telechargez : https://github.com/espeak-ng/espeak-ng/releases/latest
    echo Fichier : espeak-ng-X.XX-x64.msi
    pause
    exit /b 1
)

:: ── Créer les dossiers nécessaires ──────────────
if not exist "audio"   mkdir audio
if not exist "uploads" mkdir uploads
if not exist "voices"  mkdir voices

:: ── Ouvrir le navigateur après 3 secondes ───────
echo Demarrage du serveur...
echo Le navigateur va s'ouvrir automatiquement.
echo.
echo [IMPORTANT] Ne fermez pas cette fenetre !
echo Pour arreter : appuyez sur CTRL+C
echo.

start "" cmd /c "timeout /t 3 >nul && start http://localhost:8000"

:: ── Lancer le serveur ───────────────────────────
python app.py

pause
