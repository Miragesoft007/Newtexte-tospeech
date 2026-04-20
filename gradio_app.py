"""
AudioVox — Lecteur de livres audio avec clonage vocal
Moteur : Coqui XTTS v2 (clonage réel) → VoxCPM2 → espeak-ng
"""

import os
import shutil
import logging
import subprocess
import tempfile
import numpy as np
from pathlib import Path
from typing import Optional, Tuple

import gradio as gr
from book_parser import BookParser

os.environ["TOKENIZERS_PARALLELISM"] = "false"
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# Moteur TTS — 3 niveaux : XTTS v2 → VoxCPM2 → espeak-ng
# ═══════════════════════════════════════════════════════════════════════════════

class TTSBackend:
    """
    Priorité :
      1. Coqui XTTS v2  — clonage vocal réel, FR+AR, CPU/GPU
      2. VoxCPM2        — voice design + clonage, GPU requis
      3. espeak-ng      — fallback hors-ligne (qualité limitée)
    """

    XTTS_LANGS  = {"fr": "fr", "ar": "ar"}
    ESPEAK_LANG = {"fr": "fr", "ar": "ar"}

    def __init__(self):
        self.engine      = None
        self.xtts        = None
        self.vox_model   = None
        self.sample_rate = 24000
        self._init()

    # ── Init ────────────────────────────────────────────────────────────────

    def _init(self):
        # Niveau 1 : Coqui XTTS v2
        try:
            self._load_xtts()
            self.engine = "xtts"
            logger.info("✓ XTTS v2 prêt — clonage vocal activé")
            return
        except Exception as e:
            logger.warning(f"XTTS v2 non disponible : {e}")

        # Niveau 2 : VoxCPM2
        try:
            self._load_voxcpm()
            self.engine = "voxcpm"
            logger.info("✓ VoxCPM2 prêt")
            return
        except Exception as e:
            logger.warning(f"VoxCPM2 non disponible : {e}")

        # Niveau 3 : espeak-ng
        if shutil.which("espeak-ng"):
            self.engine      = "espeak"
            self.sample_rate = 22050
            logger.info("✓ espeak-ng prêt (mode hors-ligne)")
        else:
            raise RuntimeError(
                "Aucun moteur TTS disponible.\n"
                "Installez espeak-ng : https://github.com/espeak-ng/espeak-ng/releases"
            )

    def _load_xtts(self):
        from TTS.api import TTS
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Chargement XTTS v2 sur {device}…")
        self.xtts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        self.sample_rate = 24000

    def _load_voxcpm(self):
        import voxcpm, torch
        self.vox_model   = voxcpm.VoxCPM.from_pretrained("openbmb/VoxCPM2", optimize=True)
        self.sample_rate = self.vox_model.tts_model.sample_rate

    # ── Génération principale ───────────────────────────────────────────────

    def generate(
        self,
        text: str,
        language: str = "fr",
        speaker_wav: Optional[str] = None,
        control: str = "",
        cfg: float = 2.0,
        steps: int = 10,
    ) -> Tuple[int, np.ndarray]:
        text = (text or "").strip()
        if not text:
            raise ValueError("Le texte est vide.")

        if self.engine == "xtts":
            return self._gen_xtts(text, language, speaker_wav)
        if self.engine == "voxcpm":
            return self._gen_voxcpm(text, control, speaker_wav, cfg, steps)
        return self._gen_espeak(text, language)

    # ── XTTS v2 ─────────────────────────────────────────────────────────────

    def _gen_xtts(
        self,
        text: str,
        language: str,
        speaker_wav: Optional[str],
    ) -> Tuple[int, np.ndarray]:
        lang = self.XTTS_LANGS.get(language, "fr")

        if speaker_wav and Path(speaker_wav).exists():
            # Clonage vocal avec l'audio de référence
            wav = self.xtts.tts(text=text, speaker_wav=speaker_wav, language=lang)
        else:
            # Voix par défaut XTTS (première voix disponible)
            speakers = self.xtts.speakers or []
            if speakers:
                wav = self.xtts.tts(text=text, speaker=speakers[0], language=lang)
            else:
                # modèle sans liste de speakers — utilise une voix interne
                wav = self.xtts.tts(text=text, language=lang)

        wav_np = np.array(wav, dtype=np.float32)
        # Normaliser pour éviter le clipping
        peak = np.abs(wav_np).max()
        if peak > 0:
            wav_np = wav_np / peak * 0.95
        return (self.sample_rate, wav_np)

    # ── VoxCPM2 ─────────────────────────────────────────────────────────────

    def _gen_voxcpm(
        self,
        text: str,
        control: str,
        ref_wav: Optional[str],
        cfg: float,
        steps: int,
    ) -> Tuple[int, np.ndarray]:
        control  = (control or "").strip()
        full_txt = f"({control}){text}" if control else text
        kwargs   = dict(text=full_txt, cfg_value=float(cfg), inference_timesteps=int(steps))
        if ref_wav and Path(ref_wav).exists():
            kwargs["reference_wav_path"] = ref_wav
        wav = self.vox_model.generate(**kwargs)
        return (self.sample_rate, wav)

    # ── espeak-ng ────────────────────────────────────────────────────────────

    def _gen_espeak(self, text: str, language: str) -> Tuple[int, np.ndarray]:
        import soundfile as sf
        voice = self.ESPEAK_LANG.get(language, "fr")
        tmp   = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
        try:
            subprocess.run(
                ["espeak-ng", "-v", voice, "-w", tmp, text],
                check=True, capture_output=True,
            )
            wav, sr = sf.read(tmp)
        finally:
            Path(tmp).unlink(missing_ok=True)
        return (sr, wav.astype(np.float32))

    # ── Propriétés ───────────────────────────────────────────────────────────

    @property
    def supports_cloning(self) -> bool:
        return self.engine in ("xtts", "voxcpm")

    @property
    def engine_label(self) -> str:
        return {
            "xtts":   "🟢 XTTS v2 — Clonage vocal actif",
            "voxcpm": "🟢 VoxCPM2 — Clonage vocal actif",
            "espeak": "🟡 espeak-ng — Mode hors-ligne (qualité limitée)",
        }.get(self.engine, self.engine)

    @property
    def xtts_speakers(self) -> list:
        if self.engine == "xtts" and self.xtts and self.xtts.speakers:
            return self.xtts.speakers
        return []


# ═══════════════════════════════════════════════════════════════════════════════
# Interface Gradio
# ═══════════════════════════════════════════════════════════════════════════════

THEME = gr.themes.Soft(
    primary_hue="violet",
    secondary_hue="slate",
    font=[gr.themes.GoogleFont("Inter"), "sans-serif"],
)

CSS = """
.engine-pill {
    display:inline-block; padding:4px 16px;
    border-radius:20px; font-size:.82rem; font-weight:600;
    background:#1e2030; border:1px solid #3d4166; color:#9099c4;
    margin-bottom:8px;
}
.clone-tip { background:rgba(108,99,255,.08); border-left:3px solid #6c63ff;
             padding:10px 14px; border-radius:0 8px 8px 0; font-size:.85rem; margin-top:8px; }
footer { display:none !important; }
"""

def build_ui(backend: TTSBackend) -> gr.Blocks:
    parser   = BookParser()
    book_data = {"chapters": [], "flat": []}

    # ── helpers ─────────────────────────────────────────────────────────────

    def _safe_gen(text, lang, speaker_wav, control="", cfg=2.0, steps=10):
        try:
            return backend.generate(text, lang, speaker_wav, control, cfg, steps), gr.update(visible=False)
        except Exception as e:
            return None, gr.update(value=f"❌ {e}", visible=True)

    # ════════════════════════════════════════════════════════════════════════
    with gr.Blocks(theme=THEME, css=CSS, title="AudioVox") as demo:

        gr.HTML(f"""
        <div style="text-align:center;padding:16px 0 8px">
          <h1 style="font-size:1.8rem;font-weight:800;margin:0">🎧 AudioVox</h1>
          <p style="color:#888;margin:4px 0 10px">Lecteur de livres audio — Français & Arabe</p>
          <span class="engine-pill">{backend.engine_label}</span>
        </div>
        """)

        with gr.Tabs():

            # ══════════════════════════════════════════════════════════════════
            # Onglet 1 — Clonage & Synthèse vocale
            # ══════════════════════════════════════════════════════════════════
            with gr.Tab("🎤 Synthèse & Clonage vocal"):

                if not backend.supports_cloning:
                    gr.Markdown("""
> ⚠️ **XTTS v2 / VoxCPM2 non trouvé** — seul espeak-ng est actif.
> Pour activer le clonage : `pip install TTS` puis relancez l'app.
                    """)

                with gr.Row():
                    # ── Colonne gauche ──────────────────────────────────────
                    with gr.Column(scale=1):
                        gr.Markdown("### 🎤 Votre voix")
                        ref_audio = gr.Audio(
                            sources=["microphone", "upload"],
                            type="filepath",
                            label="Enregistrez ou importez votre voix (6–30 secondes)",
                        )
                        gr.HTML("""<div class="clone-tip">
💡 <b>Conseil clonage :</b> Lisez un texte normal à voix haute pendant 10–30 secondes.
Plus l'enregistrement est long et clair, meilleur sera le clone.
</div>""")

                        gr.Markdown("### ✍️ Texte à synthétiser")
                        tts_text = gr.Textbox(
                            label="Texte",
                            placeholder="Entrez le texte à lire…",
                            lines=5,
                            value="Bonjour, ceci est un test de synthèse vocale avec clonage.",
                        )
                        tts_lang = gr.Radio(
                            choices=[("🇫🇷 Français", "fr"), ("🇸🇦 Arabe", "ar")],
                            value="fr",
                            label="Langue",
                        )

                        # Instruction VoxCPM (visible seulement si voxcpm actif)
                        vox_ctrl = gr.Textbox(
                            label="🎛️ Instruction de style (VoxCPM2 uniquement)",
                            placeholder="Ex: Voix douce et lente / صوت هادئ",
                            lines=2,
                            visible=(backend.engine == "voxcpm"),
                        )

                        with gr.Accordion("⚙️ Paramètres avancés", open=False):
                            cfg_sl   = gr.Slider(1.0, 3.0, value=2.0, step=0.1,
                                                 label="CFG — force du guidage",
                                                 interactive=(backend.engine == "voxcpm"))
                            steps_sl = gr.Slider(1, 50, value=10, step=1,
                                                 label="Étapes de diffusion",
                                                 interactive=(backend.engine == "voxcpm"))

                        gen_btn = gr.Button("🔊 Générer", variant="primary", size="lg")

                    # ── Colonne droite ──────────────────────────────────────
                    with gr.Column(scale=1):
                        gr.Markdown("### 🎧 Résultat")
                        audio_out = gr.Audio(label="Audio généré", type="numpy")
                        err_box   = gr.Markdown("", visible=False)

                        gr.Markdown("""---
**Modes disponibles selon le moteur :**

| | XTTS v2 | VoxCPM2 | espeak-ng |
|---|---|---|---|
| Synthèse FR/AR | ✅ | ✅ | ✅ |
| Clonage vocal | ✅ | ✅ | ❌ |
| Qualité audio | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| GPU requis | Non | Oui | Non |

**Installer XTTS v2 (recommandé) :**
```
pip install TTS
```
**Installer VoxCPM2 (meilleure qualité, GPU) :**
```
pip install voxcpm torch
```
                        """)

                gen_btn.click(
                    fn=lambda txt, lang, wav, ctrl, cfg, steps: _safe_gen(txt, lang, wav, ctrl, cfg, steps),
                    inputs=[tts_text, tts_lang, ref_audio, vox_ctrl, cfg_sl, steps_sl],
                    outputs=[audio_out, err_box],
                )

            # ══════════════════════════════════════════════════════════════════
            # Onglet 2 — Lecture de livre
            # ══════════════════════════════════════════════════════════════════
            with gr.Tab("📚 Lecture de livre"):
                with gr.Row():
                    # ── Panneau gauche ──────────────────────────────────────
                    with gr.Column(scale=1):
                        gr.Markdown("### 📁 Importer un livre")
                        book_file = gr.File(
                            label="Glissez un fichier ici",
                            file_types=[".txt", ".pdf", ".epub", ".docx", ".doc"],
                        )
                        book_btn  = gr.Button("📖 Charger", variant="secondary")
                        book_info = gr.Markdown("*Aucun livre chargé*")

                        gr.Markdown("### ⚙️ Options de lecture")
                        book_lang = gr.Radio(
                            choices=[("🇫🇷 Français", "fr"), ("🇸🇦 Arabe", "ar")],
                            value="fr", label="Langue du livre",
                        )
                        book_voice = gr.Audio(
                            sources=["microphone", "upload"],
                            type="filepath",
                            label="🎤 Votre voix (optionnel — pour cloner votre timbre)",
                        )

                        chapter_dd = gr.Dropdown(label="📑 Chapitre", choices=[], interactive=True)
                        para_dd    = gr.Dropdown(label="§ Paragraphe", choices=[], interactive=True)

                    # ── Panneau droit ───────────────────────────────────────
                    with gr.Column(scale=2):
                        para_box = gr.Textbox(
                            label="Texte du paragraphe",
                            lines=10,
                            interactive=True,
                        )
                        with gr.Row():
                            read_para = gr.Button("▶ Lire ce paragraphe", variant="primary")
                            read_chap = gr.Button("📖 Lire tout le chapitre", variant="secondary")
                        book_audio  = gr.Audio(label="🎧 Audio", type="numpy")
                        book_status = gr.Markdown("")

                # ── Events livre ─────────────────────────────────────────────

                def load_book(f):
                    if f is None:
                        return "*Aucun fichier*", gr.update(choices=[]), gr.update(choices=[]), ""
                    try:
                        chapters = parser.parse(f.name)
                        book_data["chapters"] = chapters
                        ch_list = [f"Chapitre {i+1} — {ch['title'][:45]}" for i, ch in enumerate(chapters)]
                        total   = sum(len(c["paragraphs"]) for c in chapters)
                        info    = f"✅ **{Path(f.name).name}** — {len(chapters)} chapitre(s) · {total} paragraphe(s)"
                        return (info,
                                gr.update(choices=ch_list, value=ch_list[0] if ch_list else None),
                                gr.update(choices=[]),
                                "")
                    except Exception as e:
                        return f"❌ {e}", gr.update(choices=[]), gr.update(choices=[]), ""

                def on_chapter(ch_lbl):
                    if not ch_lbl or not book_data["chapters"]:
                        return gr.update(choices=[]), ""
                    idx   = next((i for i, ch in enumerate(book_data["chapters"])
                                  if ch_lbl.startswith(f"Chapitre {i+1}")), 0)
                    paras = book_data["chapters"][idx]["paragraphs"]
                    opts  = [f"§{j+1} — {p[:55]}…" if len(p) > 55 else f"§{j+1} — {p}"
                             for j, p in enumerate(paras)]
                    return gr.update(choices=opts, value=opts[0] if opts else None), paras[0] if paras else ""

                def on_para(ch_lbl, p_lbl):
                    if not ch_lbl or not p_lbl or not book_data["chapters"]:
                        return ""
                    ci    = next((i for i, ch in enumerate(book_data["chapters"])
                                  if ch_lbl.startswith(f"Chapitre {i+1}")), 0)
                    pi    = int(p_lbl.split("§")[1].split(" ")[0]) - 1
                    paras = book_data["chapters"][ci]["paragraphs"]
                    return paras[pi] if 0 <= pi < len(paras) else ""

                def read_para_fn(text, lang, voice):
                    if not text.strip():
                        return None, "⚠️ Paragraphe vide."
                    try:
                        return backend.generate(text, lang, voice), ""
                    except Exception as e:
                        return None, f"❌ {e}"

                def read_chap_fn(ch_lbl, lang, voice):
                    if not ch_lbl or not book_data["chapters"]:
                        return None, "⚠️ Aucun chapitre sélectionné."
                    ci    = next((i for i, ch in enumerate(book_data["chapters"])
                                  if ch_lbl.startswith(f"Chapitre {i+1}")), 0)
                    paras = book_data["chapters"][ci]["paragraphs"]
                    full  = " ".join(paras)
                    return read_para_fn(full, lang, voice)

                book_btn.click(load_book, [book_file], [book_info, chapter_dd, para_dd, para_box])
                chapter_dd.change(on_chapter, [chapter_dd], [para_dd, para_box])
                para_dd.change(on_para, [chapter_dd, para_dd], [para_box])
                read_para.click(read_para_fn, [para_box, book_lang, book_voice], [book_audio, book_status])
                read_chap.click(read_chap_fn, [chapter_dd, book_lang, book_voice], [book_audio, book_status])

            # ══════════════════════════════════════════════════════════════════
            # Onglet 3 — Texte libre
            # ══════════════════════════════════════════════════════════════════
            with gr.Tab("✏️ Texte libre"):
                with gr.Row():
                    with gr.Column(scale=2):
                        free_txt  = gr.Textbox(
                            label="Votre texte (toute taille)",
                            placeholder="Collez ou tapez votre texte ici…",
                            lines=14,
                        )
                        free_lang = gr.Radio(
                            choices=[("🇫🇷 Français", "fr"), ("🇸🇦 Arabe", "ar")],
                            value="fr", label="Langue",
                        )
                        free_btn  = gr.Button("🔊 Lire ce texte", variant="primary", size="lg")

                    with gr.Column(scale=1):
                        free_voice = gr.Audio(
                            sources=["microphone", "upload"],
                            type="filepath",
                            label="🎤 Votre voix (optionnel)",
                        )
                        free_audio = gr.Audio(label="🎧 Audio généré", type="numpy")
                        free_err   = gr.Markdown("", visible=False)

                free_btn.click(
                    fn=lambda txt, lang, wav: _safe_gen(txt, lang, wav),
                    inputs=[free_txt, free_lang, free_voice],
                    outputs=[free_audio, free_err],
                )

    gr.set_static_paths(paths=[Path.cwd().absolute() / "assets"])
    return demo


# ═══════════════════════════════════════════════════════════════════════════════
# Lancement
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=7860)
    ap.add_argument("--host", type=str, default="0.0.0.0")
    args = ap.parse_args()

    print("\n=== AudioVox — Initialisation ===")
    backend = TTSBackend()
    print(f"Moteur actif : {backend.engine_label}\n")

    ui = build_ui(backend)
    ui.queue(max_size=5).launch(
        server_name=args.host,
        server_port=args.port,
        show_error=True,
        share=False,
    )
