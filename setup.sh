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

echo "→ Installation des dépendances…"
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Optional: VoxCPM2 (GPU required)
if command -v nvidia-smi &>/dev/null; then
  echo ""
  read -rp "GPU détecté. Installer VoxCPM2 pour le clonage vocal ? [o/N] " ans
  if [[ "$ans" =~ ^[Oo]$ ]]; then
    pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cu121
    pip install -q voxcpm
    sed -i 's/# voxcpm/voxcpm/' requirements.txt
    echo "✓ VoxCPM2 installé"
  fi
fi

# ffmpeg check (needed for audio conversion)
if ! command -v ffmpeg &>/dev/null; then
  echo ""
  echo "⚠  ffmpeg non trouvé — recommandé pour la conversion audio."
  echo "   Ubuntu/Debian : sudo apt install ffmpeg"
  echo "   macOS         : brew install ffmpeg"
fi

echo ""
echo "✅ Installation terminée !"
echo ""
echo "Pour démarrer l'application :"
echo "  source .venv/bin/activate"
echo "  python app.py"
echo ""
echo "Puis ouvrez : http://localhost:8000"
