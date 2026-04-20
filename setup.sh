#!/usr/bin/env bash
set -e

echo "════════════════════════════════════════"
echo "  AudioVox — Lecteur de livres FR/AR    "
echo "════════════════════════════════════════"

# Python version check
python3 -c "import sys; assert sys.version_info >= (3,10), 'Python 3.10+ requis'" 2>/dev/null || {
  echo "❌ Python 3.10 ou supérieur requis."
  exit 1
}

# Virtual environment
if [ ! -d ".venv" ]; then
  echo "→ Création de l'environnement virtuel…"
  python3 -m venv .venv
fi
source .venv/bin/activate

echo "→ Installation de espeak-ng (moteur TTS hors-ligne)…"
if command -v apt-get &>/dev/null; then
  apt-get install -y espeak-ng espeak-ng-data 2>/dev/null || sudo apt-get install -y espeak-ng espeak-ng-data
  echo "✓ espeak-ng installé"
elif command -v brew &>/dev/null; then
  brew install espeak
  echo "✓ espeak installé (macOS)"
else
  echo "⚠  Installez espeak-ng manuellement depuis https://github.com/espeak-ng/espeak-ng"
fi

echo "→ Installation des dépendances Python…"
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Optional: VoxCPM2 (GPU required, voice cloning)
if command -v nvidia-smi &>/dev/null; then
  echo ""
  read -rp "GPU détecté. Installer VoxCPM2 pour le clonage vocal ? [o/N] " ans
  if [[ "$ans" =~ ^[Oo]$ ]]; then
    pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cu121
    pip install -q voxcpm
    echo "✓ VoxCPM2 installé"
  fi
fi

echo ""
echo "✅ Installation terminée !"
echo ""
echo "Pour démarrer l'application :"
echo "  source .venv/bin/activate"
echo "  python app.py"
echo ""
echo "Puis ouvrez : http://localhost:8000"
