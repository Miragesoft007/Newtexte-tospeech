@echo off
chcp 65001 >nul
title AudioVox — Installation Windows

echo.
echo ══════════════════════════════════════════════
echo   AudioVox — Installation Windows
echo ══════════════════════════════════════════════
echo.

:: ── Python ──────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Python non installe !
    echo Telechargez Python 3.11 : https://www.python.org/downloads/
    echo IMPORTANT : Cochez "Add Python to PATH" !
    pause & exit /b 1
)
for /f "tokens=2" %%v in ('python --version') do echo [OK] Python %%v detecte

:: ── Environnement virtuel ────────────────────────
if not exist ".venv" (
    echo Creation de l'environnement virtuel...
    python -m venv .venv
)
call .venv\Scripts\activate.bat
echo [OK] Environnement virtuel actif

:: ── pip ────────────────────────────────────────
echo Mise a jour de pip...
python -m pip install --upgrade pip -q

:: ── Dependances de base ──────────────────────────
echo.
echo Installation des dependances de base...
pip install -q gradio fastapi uvicorn python-multipart ^
    pdfplumber PyPDF2 ebooklib beautifulsoup4 lxml soundfile python-docx numpy

if errorlevel 1 (
    echo [ERREUR] Echec installation des dependances
    pause & exit /b 1
)
echo [OK] Dependances de base installees

:: ── Coqui XTTS v2 — Clonage vocal (recommande) ──
echo.
echo ══════════════════════════════════════════════
echo   XTTS v2 — Clonage vocal reel (recommande)
echo   Fonctionne sur CPU et GPU
echo   Taille : ~1.8 GB (telechargement au 1er lancement)
echo ══════════════════════════════════════════════
set /p INSTALL_XTTS="Installer XTTS v2 pour le clonage vocal ? [O/n] "
if /i not "%INSTALL_XTTS%"=="n" (
    echo Installation de Coqui TTS (XTTS v2)...
    pip install -q TTS
    if not errorlevel 1 (
        echo [OK] XTTS v2 installe ! Clonage vocal active.
    ) else (
        echo [WARN] Echec installation XTTS v2 - espeak-ng sera utilise.
    )
) else (
    echo [INFO] XTTS v2 ignore. Vous pouvez l'installer plus tard : pip install TTS
)

:: ── espeak-ng (fallback hors-ligne) ──────────────
espeak-ng --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [INFO] espeak-ng non installe (fallback TTS hors-ligne)
    echo        Telechargez : https://github.com/espeak-ng/espeak-ng/releases/latest
    echo        Fichier     : espeak-ng-X.XX-x64.msi
    echo.
) else (
    for /f "tokens=*" %%v in ('espeak-ng --version 2^>^&1') do echo [OK] %%v
)

:: ── VoxCPM2 (optionnel, GPU requis) ─────────────
echo.
nvidia-smi >nul 2>&1
if not errorlevel 1 (
    echo GPU NVIDIA detecte !
    set /p INSTALL_VOX="Installer VoxCPM2 (meilleure qualite, GPU) ? [O/n] "
    if /i not "%INSTALL_VOX%"=="n" (
        echo Installation de PyTorch + VoxCPM2...
        pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cu121
        pip install -q voxcpm funasr
        if not errorlevel 1 (
            echo [OK] VoxCPM2 installe !
        ) else (
            echo [WARN] Echec installation VoxCPM2.
        )
    )
) else (
    echo [INFO] Pas de GPU NVIDIA - VoxCPM2 ignore.
)

echo.
echo ══════════════════════════════════════════════
echo   Installation terminee !
echo   Double-cliquez sur : start_windows.bat
echo ══════════════════════════════════════════════
echo.
pause
