@echo off
chcp 65001 >nul
title AudioVox — Installation Windows

echo.
echo ══════════════════════════════════════════════
echo   AudioVox — Lecteur de livres FR/AR
echo   Installation Windows
echo ══════════════════════════════════════════════
echo.

:: ── Vérifier Python ─────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Python n'est pas installe !
    echo.
    echo Telechargez Python 3.11 ici :
    echo https://www.python.org/downloads/
    echo.
    echo IMPORTANT : Cochez "Add Python to PATH" pendant l'installation !
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version') do set PYVER=%%v
echo [OK] Python %PYVER% detecte

:: ── Créer l'environnement virtuel ───────────────
if not exist ".venv" (
    echo.
    echo Creation de l'environnement virtuel...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERREUR] Impossible de creer le venv
        pause
        exit /b 1
    )
    echo [OK] Environnement virtuel cree
) else (
    echo [OK] Environnement virtuel existant
)

:: ── Activer le venv ─────────────────────────────
call .venv\Scripts\activate.bat

:: ── Mettre à jour pip ───────────────────────────
echo.
echo Mise a jour de pip...
python -m pip install --upgrade pip -q

:: ── Installer les dépendances Python ────────────
echo.
echo Installation des dependances Python...
pip install fastapi "uvicorn[standard]" python-multipart pdfplumber PyPDF2 ebooklib beautifulsoup4 lxml soundfile -q
if errorlevel 1 (
    echo [ERREUR] Echec installation des dependances
    pause
    exit /b 1
)
echo [OK] Dependances Python installees

:: ── Vérifier espeak-ng ──────────────────────────
echo.
espeak-ng --version >nul 2>&1
if errorlevel 1 (
    echo [ATTENTION] espeak-ng n'est pas installe !
    echo.
    echo Telechargez et installez espeak-ng :
    echo https://github.com/espeak-ng/espeak-ng/releases/latest
    echo.
    echo Cherchez le fichier : espeak-ng-X.XX-x64.msi
    echo Apres installation, RELANCEZ ce script.
    echo.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%v in ('espeak-ng --version 2^>^&1') do echo [OK] %%v
)

echo.
echo ══════════════════════════════════════════════
echo   Installation terminee avec succes !
echo   Lancez maintenant : start_windows.bat
echo ══════════════════════════════════════════════
echo.
pause
