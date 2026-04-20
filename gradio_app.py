"""
AudioVox — Interface Gradio identique à la démo VoxCPM2
+ onglet Lecture de livre (TXT / PDF / EPUB / DOCX)
+ support français & arabe
"""

import os
import sys
import logging
import subprocess
import tempfile
import shutil
import numpy as np
from pathlib import Path
from typing import Optional, Tuple

import gradio as gr

from book_parser import BookParser

os.environ["TOKENIZERS_PARALLELISM"] = "false"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# Moteur TTS (VoxCPM2 ou espeak-ng en fallback)
# ═══════════════════════════════════════════════════════════════════════════════

class TTSBackend:
    def __init__(self):
        self.engine = None
        self.vox_model = None
        self.asr_model = None
        self.sample_rate = 24000
        self._init()

    def _init(self):
        try:
            import voxcpm
            import torch
            logger.info("Chargement de VoxCPM2…")
            self.vox_model = voxcpm.VoxCPM.from_pretrained("openbmb/VoxCPM2", optimize=True)
            self.sample_rate = self.vox_model.tts_model.sample_rate
            self.engine = "voxcpm"
            logger.info(f"✓ VoxCPM2 prêt (sample_rate={self.sample_rate})")

            # ASR optionnel pour la transcription automatique
            try:
                from funasr import AutoModel
                import torch
                device = "cuda:0" if torch.cuda.is_available() else "cpu"
                self.asr_model = AutoModel(
                    model="iic/SenseVoiceSmall",
                    disable_update=True,
                    log_level="ERROR",
                    device=device,
                )
                logger.info("✓ ASR (SenseVoiceSmall) prêt")
            except Exception as e:
                logger.warning(f"ASR non disponible: {e}")

        except Exception as e:
            logger.warning(f"VoxCPM2 non disponible ({e}) — utilisation de espeak-ng")
            if not shutil.which("espeak-ng"):
                raise RuntimeError(
                    "Ni VoxCPM2 ni espeak-ng trouvés.\n"
                    "Installez espeak-ng : https://github.com/espeak-ng/espeak-ng/releases"
                )
            self.engine = "espeak"
            self.sample_rate = 22050
            logger.info("✓ espeak-ng prêt (mode hors-ligne)")

    # ── Génération ────────────────────────────────────────────────────────────

    def generate(
        self,
        text: str,
        control_instruction: str = "",
        reference_wav_path: Optional[str] = None,
        use_ultimate_cloning: bool = False,
        prompt_text: str = "",
        cfg_value: float = 2.0,
        dit_steps: int = 10,
        do_normalize: bool = False,
        denoise: bool = False,
        language: str = "fr",
    ) -> Tuple[int, np.ndarray]:
        text = (text or "").strip()
        if not text:
            raise ValueError("Le texte est vide.")

        if self.engine == "voxcpm":
            return self._generate_voxcpm(
                text, control_instruction, reference_wav_path,
                use_ultimate_cloning, prompt_text,
                cfg_value, dit_steps, do_normalize, denoise,
            )
        return self._generate_espeak(text, language)

    def _generate_voxcpm(
        self,
        text, control, ref_wav, use_ultimate, prompt_text,
        cfg, steps, normalize, denoise,
    ) -> Tuple[int, np.ndarray]:
        control = (control or "").strip()
        final_text = f"({control}){text}" if control and not use_ultimate else text

        kwargs = dict(
            text=final_text,
            cfg_value=float(cfg),
            inference_timesteps=int(steps),
            normalize=normalize,
            denoise=denoise,
        )
        if ref_wav:
            kwargs["reference_wav_path"] = ref_wav
        if use_ultimate and ref_wav and prompt_text.strip():
            kwargs["prompt_wav_path"] = ref_wav
            kwargs["prompt_text"] = prompt_text.strip()

        wav = self.vox_model.generate(**kwargs)
        return (self.sample_rate, wav)

    def _generate_espeak(self, text: str, language: str) -> Tuple[int, np.ndarray]:
        import soundfile as sf
        voices = {"fr": "fr", "ar": "ar"}
        voice = voices.get(language, "fr")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        try:
            subprocess.run(
                ["espeak-ng", "-v", voice, "-w", tmp, text],
                check=True, capture_output=True,
            )
            wav, sr = sf.read(tmp)
        finally:
            Path(tmp).unlink(missing_ok=True)
        return (sr, wav.astype(np.float32))

    # ── ASR ───────────────────────────────────────────────────────────────────

    def transcribe(self, audio_path: str) -> str:
        if not audio_path or not self.asr_model:
            return ""
        try:
            res = self.asr_model.generate(input=audio_path, language="auto", use_itn=True)
            return res[0]["text"].split("|>")[-1]
        except Exception as e:
            logger.warning(f"ASR échoué: {e}")
            return ""

    @property
    def supports_cloning(self):
        return self.engine == "voxcpm"

    @property
    def supports_asr(self):
        return self.asr_model is not None


# ═══════════════════════════════════════════════════════════════════════════════
# CSS & Thème
# ═══════════════════════════════════════════════════════════════════════════════

CUSTOM_CSS = """
.logo-container { text-align:center; margin:0.5rem 0 1rem 0; }
.logo-container img { height:72px; width:auto; display:inline-block; }
.engine-badge {
    display:inline-flex; align-items:center; gap:6px;
    background:#1e2030; border:1px solid #3d4166;
    border-radius:20px; padding:4px 14px;
    font-size:.82rem; color:#9099c4;
}
.engine-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
.dot-green { background:#22c55e; box-shadow:0 0 6px #22c55e; }
.dot-yellow { background:#f59e0b; box-shadow:0 0 6px #f59e0b; }
.switch-toggle input[type=checkbox] {
    appearance:none; width:44px; height:24px;
    background:#555; border-radius:12px; position:relative; cursor:pointer; transition:.3s;
}
.switch-toggle input[type=checkbox]::after {
    content:""; position:absolute; top:2px; left:2px;
    width:20px; height:20px; background:#fff; border-radius:50%;
    transition:.3s; box-shadow:0 1px 3px rgba(0,0,0,.3);
}
.switch-toggle input[type=checkbox]:checked { background:var(--color-accent); }
.switch-toggle input[type=checkbox]:checked::after { transform:translateX(20px); }
"""

THEME = gr.themes.Soft(
    primary_hue="blue",
    secondary_hue="gray",
    neutral_hue="slate",
    font=[gr.themes.GoogleFont("Inter"), "Arial", "sans-serif"],
)

# ═══════════════════════════════════════════════════════════════════════════════
# Construction de l'interface
# ═══════════════════════════════════════════════════════════════════════════════

def build_app(backend: TTSBackend) -> gr.Blocks:
    parser = BookParser()
    book_data = {"chapters": [], "flat": []}

    engine_html = (
        f'<div class="engine-badge">'
        f'<span class="engine-dot {"dot-green" if backend.engine == "voxcpm" else "dot-yellow"}"></span>'
        f'{"🤖 VoxCPM2 — Clonage vocal actif" if backend.engine == "voxcpm" else "🔊 espeak-ng — Mode hors-ligne (installez VoxCPM2 pour le clonage)"}'
        f'</div>'
    )

    cloning_note = (
        "" if backend.supports_cloning else
        "> ⚠️ **VoxCPM2 non installé** — Le clonage vocal et la Voice Design ne sont pas disponibles. "
        "Seule la synthèse espeak-ng (hors-ligne) est active.\n\n"
        "> **Installer VoxCPM2 :** `pip install voxcpm torch torchaudio --index-url https://download.pytorch.org/whl/cu121` (GPU requis)"
    )

    with gr.Blocks(title="AudioVox — VoxCPM2") as demo:

        # Logo
        gr.HTML(
            '<div class="logo-container">'
            '<img src="/gradio_api/file=assets/voxcpm_logo.png" alt="VoxCPM2" '
            'onerror="this.style.display=\'none\'">'
            '</div>'
        )
        gr.HTML(engine_html)
        if cloning_note:
            gr.Markdown(cloning_note)

        with gr.Tabs():

            # ══ Onglet 1 : Synthèse vocale ═══════════════════════════════════
            with gr.Tab("🎤 Synthèse vocale"):
                gr.Markdown("""
**VoxCPM2 — Trois modes :**
🎨 **Voice Design** — Décrivez la voix dans le champ *Instruction de contrôle*, sans audio de référence.
🎛️ **Clonage contrôlable** — Importez un audio + guidez le style via l'instruction.
🎙️ **Clonage ultime** — Activez le mode + entrez la transcription pour reproduire chaque nuance.
                """)

                with gr.Row():
                    with gr.Column(scale=1):
                        ref_audio = gr.Audio(
                            sources=["upload", "microphone"],
                            type="filepath",
                            label="🎤 Audio de référence (optionnel — pour le clonage)",
                        )
                        ultimate_mode = gr.Checkbox(
                            value=False,
                            label="🎙️ Mode Clonage Ultime (clonage guidé par transcription)",
                            info="Auto-transcrit l'audio de référence pour reproduire chaque nuance vocale. Désactive l'instruction de contrôle.",
                            elem_classes=["switch-toggle"],
                            interactive=backend.supports_cloning,
                        )
                        prompt_text_box = gr.Textbox(
                            label="Transcription de l'audio de référence (auto-remplie, modifiable)",
                            placeholder="La transcription de votre audio apparaîtra ici…",
                            lines=2,
                            visible=False,
                        )
                        control_box = gr.Textbox(
                            label="🎛️ Instruction de contrôle (optionnel)",
                            placeholder="Ex : Jeune femme douce et chaleureuse / صوت شاب هادئ / Excited fast pace",
                            lines=2,
                            interactive=backend.supports_cloning,
                        )
                        target_text = gr.Textbox(
                            label="✍️ Texte à synthétiser",
                            value="VoxCPM2 est un modèle de synthèse vocale multilingue haute qualité.",
                            lines=4,
                        )
                        lang_tts = gr.Radio(
                            choices=[("🇫🇷 Français", "fr"), ("🇸🇦 Arabe", "ar"), ("🌍 Autre", "auto")],
                            value="fr",
                            label="Langue (pour espeak-ng uniquement)",
                            visible=not backend.supports_cloning,
                        )

                        with gr.Accordion("⚙️ Paramètres avancés", open=False):
                            denoise_chk = gr.Checkbox(
                                value=False, label="Débruitage de l'audio de référence",
                                elem_classes=["switch-toggle"],
                                interactive=backend.supports_cloning,
                            )
                            normalize_chk = gr.Checkbox(
                                value=False, label="Normalisation du texte",
                                elem_classes=["switch-toggle"],
                                interactive=backend.supports_cloning,
                            )
                            cfg_slider = gr.Slider(1.0, 3.0, value=2.0, step=0.1,
                                label="CFG (force de guidage)",
                                info="Plus élevé → plus fidèle à la référence",
                                interactive=backend.supports_cloning,
                            )
                            steps_slider = gr.Slider(1, 50, value=10, step=1,
                                label="Étapes de diffusion",
                                info="Plus d'étapes → meilleure qualité, plus lent",
                                interactive=backend.supports_cloning,
                            )

                        gen_btn = gr.Button("🔊 Générer la voix", variant="primary", size="lg")

                    with gr.Column(scale=1):
                        audio_out = gr.Audio(label="🎧 Audio généré", type="numpy")
                        gr.Markdown("""
---
**💡 Exemples d'instructions de contrôle :**

**Voice Design français :**
`Voix de femme mature, chaleureuse et posée, débit lent et rassurant`

**Voice Design arabe :**
`صوت رجل عربي هادئ، نبرة رسمية، لغة فصحى واضحة`

**Style + clonage :**
`Slightly faster, cheerful and energetic`
                        """)

                # Events
                def on_ultimate_toggle(checked, audio_path):
                    transcript = ""
                    if checked and audio_path and backend.supports_asr:
                        transcript = backend.transcribe(audio_path)
                    return (
                        gr.update(visible=checked, value=transcript),
                        gr.update(visible=not checked),
                    )

                ultimate_mode.change(
                    fn=on_ultimate_toggle,
                    inputs=[ultimate_mode, ref_audio],
                    outputs=[prompt_text_box, control_box],
                )

                def generate_speech(text, control, ref_wav, use_ult, prompt_t, lang,
                                    cfg, steps, norm, den):
                    try:
                        sr, wav = backend.generate(
                            text=text,
                            control_instruction=control,
                            reference_wav_path=ref_wav,
                            use_ultimate_cloning=use_ult,
                            prompt_text=prompt_t,
                            cfg_value=cfg,
                            dit_steps=steps,
                            do_normalize=norm,
                            denoise=den,
                            language=lang,
                        )
                        return (sr, wav), None
                    except Exception as e:
                        return None, gr.Warning(str(e))

                gen_btn.click(
                    fn=generate_speech,
                    inputs=[target_text, control_box, ref_audio, ultimate_mode,
                            prompt_text_box, lang_tts, cfg_slider, steps_slider,
                            normalize_chk, denoise_chk],
                    outputs=[audio_out],
                )

            # ══ Onglet 2 : Lecture de livre ═══════════════════════════════════
            with gr.Tab("📚 Lecture de livre"):
                gr.Markdown("### Chargez un livre et faites-le lire avec votre voix clonée")

                with gr.Row():
                    with gr.Column(scale=1):
                        book_upload = gr.File(
                            label="📁 Importer un livre",
                            file_types=[".txt", ".pdf", ".epub", ".docx", ".doc"],
                        )
                        lang_book = gr.Radio(
                            choices=[("🇫🇷 Français", "fr"), ("🇸🇦 العربية", "ar")],
                            value="fr",
                            label="Langue du livre",
                        )
                        ref_audio_book = gr.Audio(
                            sources=["upload", "microphone"],
                            type="filepath",
                            label="🎤 Votre voix (optionnel — pour cloner votre timbre)",
                        )
                        book_load_btn = gr.Button("📖 Charger le livre", variant="secondary")
                        book_status = gr.Markdown("*Aucun livre chargé*")
                        chapter_dd = gr.Dropdown(choices=[], label="📑 Chapitre", interactive=True)
                        para_dd    = gr.Dropdown(choices=[], label="§ Paragraphe", interactive=True)

                    with gr.Column(scale=2):
                        para_text = gr.Textbox(
                            label="Texte du paragraphe sélectionné",
                            lines=8,
                            interactive=True,
                        )
                        with gr.Row():
                            read_para_btn = gr.Button("▶ Lire ce paragraphe", variant="primary")
                            read_all_btn  = gr.Button("📖 Lire tout le chapitre", variant="secondary")
                        book_audio_out = gr.Audio(label="🎧 Audio", type="numpy")
                        book_progress  = gr.Markdown("")

                # ── Logique livre ────────────────────────────────────────────

                def load_book(file):
                    if file is None:
                        return "*Aucun fichier*", gr.update(choices=[]), gr.update(choices=[]), "", []
                    try:
                        chapters = parser.parse(file.name)
                        book_data["chapters"] = chapters
                        book_data["flat"] = [
                            (ci, pi, p)
                            for ci, ch in enumerate(chapters)
                            for pi, p in enumerate(ch["paragraphs"])
                        ]
                        ch_choices = [f"Chapitre {i+1} — {ch['title'][:40]}" for i, ch in enumerate(chapters)]
                        total = sum(len(c["paragraphs"]) for c in chapters)
                        status = f"✅ **{Path(file.name).name}** — {len(chapters)} chapitre(s), {total} paragraphe(s)"
                        return status, gr.update(choices=ch_choices, value=ch_choices[0] if ch_choices else None), gr.update(choices=[]), ""
                    except Exception as e:
                        return f"❌ Erreur : {e}", gr.update(choices=[]), gr.update(choices=[]), ""

                def on_chapter_change(ch_label):
                    if not ch_label or not book_data["chapters"]:
                        return gr.update(choices=[]), ""
                    idx = next((i for i, ch in enumerate(book_data["chapters"])
                                if ch_label.startswith(f"Chapitre {i+1}")), 0)
                    paras = book_data["chapters"][idx]["paragraphs"]
                    choices = [f"§{j+1} — {p[:60]}…" if len(p) > 60 else f"§{j+1} — {p}" for j, p in enumerate(paras)]
                    return gr.update(choices=choices, value=choices[0] if choices else None), paras[0] if paras else ""

                def on_para_change(ch_label, para_label):
                    if not ch_label or not para_label or not book_data["chapters"]:
                        return ""
                    ci = next((i for i, ch in enumerate(book_data["chapters"])
                               if ch_label.startswith(f"Chapitre {i+1}")), 0)
                    pi = int(para_label.split("§")[1].split(" ")[0]) - 1 if para_label else 0
                    paras = book_data["chapters"][ci]["paragraphs"]
                    return paras[pi] if 0 <= pi < len(paras) else ""

                def read_paragraph(text, ref_wav, lang, cfg=2.0, steps=10):
                    if not text.strip():
                        return None, "⚠️ Paragraphe vide."
                    try:
                        sr, wav = backend.generate(
                            text=text, reference_wav_path=ref_wav,
                            language=lang, cfg_value=cfg, dit_steps=steps,
                        )
                        return (sr, wav), ""
                    except Exception as e:
                        return None, f"❌ {e}"

                def read_chapter(ch_label, ref_wav, lang):
                    if not ch_label or not book_data["chapters"]:
                        return None, "⚠️ Aucun chapitre sélectionné."
                    ci = next((i for i, ch in enumerate(book_data["chapters"])
                               if ch_label.startswith(f"Chapitre {i+1}")), 0)
                    paras = book_data["chapters"][ci]["paragraphs"]
                    if not paras:
                        return None, "Chapitre vide."
                    all_text = " ".join(paras)
                    return read_paragraph(all_text, ref_wav, lang)

                book_load_btn.click(
                    fn=load_book,
                    inputs=[book_upload],
                    outputs=[book_status, chapter_dd, para_dd, para_text],
                )
                chapter_dd.change(
                    fn=on_chapter_change,
                    inputs=[chapter_dd],
                    outputs=[para_dd, para_text],
                )
                para_dd.change(
                    fn=on_para_change,
                    inputs=[chapter_dd, para_dd],
                    outputs=[para_text],
                )
                read_para_btn.click(
                    fn=read_paragraph,
                    inputs=[para_text, ref_audio_book, lang_book],
                    outputs=[book_audio_out, book_progress],
                )
                read_all_btn.click(
                    fn=read_chapter,
                    inputs=[chapter_dd, ref_audio_book, lang_book],
                    outputs=[book_audio_out, book_progress],
                )

            # ══ Onglet 3 : Texte libre ════════════════════════════════════════
            with gr.Tab("✏️ Texte libre"):
                gr.Markdown("### Entrez ou collez n'importe quel texte")
                with gr.Row():
                    with gr.Column(scale=2):
                        free_text = gr.Textbox(
                            label="Texte à lire",
                            placeholder="Collez votre texte ici — toute taille acceptée…",
                            lines=12,
                        )
                        lang_free = gr.Radio(
                            choices=[("🇫🇷 Français", "fr"), ("🇸🇦 Arabe", "ar")],
                            value="fr", label="Langue",
                        )
                    with gr.Column(scale=1):
                        ref_audio_free = gr.Audio(
                            sources=["upload", "microphone"],
                            type="filepath",
                            label="🎤 Votre voix (optionnel)",
                        )
                        ctrl_free = gr.Textbox(
                            label="🎛️ Instruction de contrôle (optionnel)",
                            placeholder="Ex : Voix posée et lente / Voice calme",
                            lines=2,
                            interactive=backend.supports_cloning,
                        )
                        read_free_btn = gr.Button("🔊 Lire ce texte", variant="primary", size="lg")
                        free_audio_out = gr.Audio(label="🎧 Audio généré", type="numpy")

                def read_free(text, lang, ref_wav, ctrl):
                    if not text.strip():
                        return None
                    _, wav = backend.generate(
                        text=text, language=lang,
                        reference_wav_path=ref_wav,
                        control_instruction=ctrl,
                    )
                    return (backend.sample_rate, wav)

                read_free_btn.click(
                    fn=read_free,
                    inputs=[free_text, lang_free, ref_audio_free, ctrl_free],
                    outputs=[free_audio_out],
                )

    gr.set_static_paths(paths=[Path.cwd().absolute() / "assets"])
    return demo


# ═══════════════════════════════════════════════════════════════════════════════
# Point d'entrée
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=7860)
    ap.add_argument("--host", type=str, default="0.0.0.0")
    args = ap.parse_args()

    print("Initialisation du moteur TTS…")
    backend = TTSBackend()
    print(f"Moteur actif : {backend.engine}")

    app = build_app(backend)
    app.queue(max_size=5, default_concurrency_limit=1).launch(
        server_name=args.host,
        server_port=args.port,
        show_error=True,
        share=False,
        theme=THEME,
        css=CUSTOM_CSS,
    )
