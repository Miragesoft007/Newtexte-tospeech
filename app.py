import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from book_parser import BookParser
from tts_engine import TTSEngine

app = FastAPI(title="AudioVox — Lecteur de livres FR/AR")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

UPLOAD_DIR = Path("uploads")
AUDIO_DIR = Path("audio")
VOICE_DIR = Path("voices")
for d in [UPLOAD_DIR, AUDIO_DIR, VOICE_DIR, Path("static")]:
    d.mkdir(exist_ok=True)

tts = TTSEngine()
parser = BookParser()

app.mount("/audio", StaticFiles(directory="audio"), name="audio")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def index():
    return FileResponse("static/index.html")


# ── Book upload ──────────────────────────────────────────────────────────────

@app.post("/api/upload-book")
async def upload_book(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in (".txt", ".pdf", ".epub"):
        raise HTTPException(400, "Format non supporté. Utilisez TXT, PDF ou EPUB.")

    book_id = str(uuid.uuid4())
    dest = UPLOAD_DIR / f"{book_id}{ext}"
    dest.write_bytes(await file.read())

    chapters = parser.parse(str(dest))
    total = sum(len(c["paragraphs"]) for c in chapters)

    return {
        "book_id": book_id,
        "filename": file.filename,
        "chapters": chapters,
        "total_paragraphs": total,
    }


# ── TTS ───────────────────────────────────────────────────────────────────────

class TTSRequest(BaseModel):
    text: str
    language: str = "fr"
    voice_id: Optional[str] = None
    voice_transcript: Optional[str] = None
    speed: float = 1.0


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(400, "Texte vide.")

    audio_id = str(uuid.uuid4())
    output_path = str(AUDIO_DIR / f"{audio_id}.mp3")

    voice_path = None
    if req.voice_id:
        for ext in (".wav", ".mp3", ".ogg", ".webm"):
            p = VOICE_DIR / f"{req.voice_id}{ext}"
            if p.exists():
                voice_path = str(p)
                break

    actual_path = await tts.synthesize(
        text=req.text,
        language=req.language,
        output_path=output_path,
        voice_sample=voice_path,
        voice_transcript=req.voice_transcript,
        speed=req.speed,
    )

    filename = Path(actual_path).name
    return {"audio_url": f"/audio/{filename}", "audio_id": audio_id}


# ── Voice sample upload ───────────────────────────────────────────────────────

@app.post("/api/upload-voice")
async def upload_voice(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower() or ".wav"
    voice_id = str(uuid.uuid4())
    dest = VOICE_DIR / f"{voice_id}{ext}"
    dest.write_bytes(await file.read())
    return {"voice_id": voice_id, "message": "Échantillon vocal enregistré ✓"}


# ── Engine info ───────────────────────────────────────────────────────────────

@app.get("/api/engine")
async def engine_info():
    return {
        "engine": tts.engine,
        "supports_cloning": tts.supports_cloning,
        "languages": ["fr", "ar"],
        "voices": {
            "fr": {"voxcpm": "VoxCPM2", "edge-tts": "fr-FR-DeniseNeural", "espeak": "espeak-ng fr"}.get(tts.engine, tts.engine),
            "ar": {"voxcpm": "VoxCPM2", "edge-tts": "ar-SA-ZariyahNeural", "espeak": "espeak-ng ar"}.get(tts.engine, tts.engine),
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
