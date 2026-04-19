import asyncio
import os
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
                print(f"VoxCPM non disponible ({type(e).__name__}), utilisation de edge-tts")
        self.engine = "edge-tts"
        print("✓ edge-tts initialisé (mode cloud)")

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
        if self.engine == "voxcpm":
            return await asyncio.get_event_loop().run_in_executor(
                None,
                self._synth_voxcpm_sync,
                text, language, output_path, voice_sample, voice_transcript, speed,
            )
        return await self._synth_edge_tts(text, language, output_path, speed)

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

        kwargs = {"text": full_text, "cfg_value": 2.0, "inference_timesteps": 10}
        if voice_sample and os.path.exists(voice_sample):
            kwargs["prompt_wav_path"] = voice_sample
            if voice_transcript:
                kwargs["prompt_text"] = voice_transcript

        wav = self.model.generate(**kwargs)

        wav_path = output_path.replace(".mp3", ".wav")
        sf.write(wav_path, wav, 24000)

        ret = os.system(f'ffmpeg -i "{wav_path}" -q:a 2 "{output_path}" -y -loglevel quiet')
        if ret == 0 and os.path.exists(output_path):
            os.remove(wav_path)
        else:
            os.rename(wav_path, output_path.replace(".mp3", ".wav"))
            output_path = output_path.replace(".mp3", ".wav")

        return output_path

    async def _synth_edge_tts(
        self,
        text: str,
        language: str,
        output_path: str,
        speed: float = 1.0,
    ) -> str:
        import edge_tts

        voices = {
            "fr": "fr-FR-DeniseNeural",
            "ar": "ar-SA-ZariyahNeural",
        }
        voice = voices.get(language, "fr-FR-DeniseNeural")

        rate_pct = int((speed - 1.0) * 100)
        rate_str = f"+{rate_pct}%" if rate_pct >= 0 else f"{rate_pct}%"

        communicate = edge_tts.Communicate(text, voice, rate=rate_str)
        await communicate.save(output_path)
        return output_path

    @property
    def supports_cloning(self) -> bool:
        return self.engine == "voxcpm"
