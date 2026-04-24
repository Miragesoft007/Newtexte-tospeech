import React, { useState, useRef } from "react";
import "./TTSInterface.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

function TTSInterface() {
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState(null);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);

  const handleGenerate = async () => {
    if (!text.trim()) return;

    setLoading(true);
    setError(null);
    setAudioSrc(null);

    try {
      const response = await fetch(`${API_URL}/api/tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, speed }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      if (data.audio) {
        setAudioSrc(data.audio);
        setTimeout(() => audioRef.current?.play(), 100);
      }
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!audioSrc) return;
    const a = document.createElement("a");
    a.href = audioSrc;
    a.download = "audio-voxcpm.wav";
    a.click();
  };

  const charCount = text.length;
  const maxChars = 500;

  return (
    <div className="tts-card">
      <div className="textarea-wrapper">
        <textarea
          className="tts-textarea"
          placeholder="Entrez votre texte ici..."
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, maxChars))}
          rows={6}
        />
        <span className={`char-count ${charCount >= maxChars ? "limit" : ""}`}>
          {charCount}/{maxChars}
        </span>
      </div>

      <div className="controls">
        <div className="speed-control">
          <label>Vitesse : {speed.toFixed(1)}x</label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
          />
        </div>

        <button
          className="btn-generate"
          onClick={handleGenerate}
          disabled={loading || !text.trim()}
        >
          {loading ? (
            <span className="spinner" />
          ) : (
            "Générer la voix"
          )}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {audioSrc && (
        <div className="audio-player">
          <audio ref={audioRef} controls src={audioSrc} className="audio-element" />
          <button className="btn-download" onClick={handleDownload}>
            Télécharger l'audio
          </button>
        </div>
      )}
    </div>
  );
}

export default TTSInterface;
