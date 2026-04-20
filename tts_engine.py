import asyncio
import os
import shlex
import subprocess
from pathlib import Path
from typing import Optional


class TTSEngine:
    def __init__(self, engine: str = "auto"):
        self.engine = engine
        self.model = None
        self._init_engine()

    def _init_engine(self):
        if self.engine in ("auto", "voxcpm"):
            try:
                self._init_voxcpm()
                self.engine = "voxcpm"
                print("✓ VoxCPM2 initialisé")
                return
            except Exception as e:
                if self.engine == "voxcpm":
                    raise RuntimeError(f"VoxCPM introuvable: {e}")
                print(f"VoxCPM non disponible ({type(e).__name__}), utilisation de espeak-ng")

        if shutil_which("espeak-ng"):
            self.engine = "espeak"
            print("✓ espeak-ng initialisé (mode hors-ligne)")
        else:
            raise RuntimeError(
                "Aucun moteur TTS disponible. "
                "Installez espeak-ng : sudo apt install espeak-ng"
            )

    def _init_voxcpm(self):
        from voxcpm import VoxCPM
        import torch
        self.model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
        if torch.cuda.is_available():
            self.model = self.model.cuda()
        self.model.eval()

    async def synthesize(
        self,
        text: str,
        language: str,
        output_path: str,
        voice_sample: Optional[str] = None,
        voice_transcript: Optional[str] = None,
        speed: float = 1.0,
    ) -> str:
        # Always output .wav (no ffmpeg required)
        output_path = str(Path(output_path).with_suffix(".wav"))

        if self.engine == "voxcpm":
            return await asyncio.get_event_loop().run_in_executor(
                None,
                self._synth_voxcpm_sync,
                text, language, output_path, voice_sample, voice_transcript, speed,
            )
        return await asyncio.get_event_loop().run_in_executor(
            None, self._synth_espeak, text, language, output_path, speed,
        )

    # ── VoxCPM2 ──────────────────────────────────────────────────────────────

    def _synth_voxcpm_sync(
        self,
        text: str,
        language: str,
        output_path: str,
        voice_sample: Optional[str],
        voice_transcript: Optional[str],
        speed: float,
    ) -> str:
        import soundfile as sf

        lang_prefix = {
            "fr": "(Une voix française naturelle et fluide)",
            "ar": "(صوت عربي طبيعي وواضح)",
        }.get(language, "")
        full_text = f"{lang_prefix}{text}" if lang_prefix else text

        kwargs: dict = {"text": full_text, "cfg_value": 2.0, "inference_timesteps": 10}
        if voice_sample and os.path.exists(voice_sample):
            kwargs["prompt_wav_path"] = voice_sample
            if voice_transcript:
                kwargs["prompt_text"] = voice_transcript

        wav = self.model.generate(**kwargs)
        sf.write(output_path, wav, 24000)
        return output_path

    # ── espeak-ng (offline) ───────────────────────────────────────────────────

    def _synth_espeak(
        self,
        text: str,
        language: str,
        output_path: str,
        speed: float,
    ) -> str:
        voices = {"fr": "fr", "ar": "ar"}
        voice = voices.get(language, "fr")

        # espeak-ng speed is words-per-minute; default ~175
        wpm = int(175 * speed)
        wpm = max(80, min(wpm, 400))

        cmd = [
            "espeak-ng",
            "-v", voice,
            "-s", str(wpm),
            "-w", output_path,
            text,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"espeak-ng error: {result.stderr}")
        return output_path

    @property
    def supports_cloning(self) -> bool:
        return self.engine == "voxcpm"


def shutil_which(name: str) -> bool:
    import shutil
    return shutil.which(name) is not None
