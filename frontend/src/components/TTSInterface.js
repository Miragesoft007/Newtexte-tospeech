import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import UsageBar from "./UsageBar";
import "./TTSInterface.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

function TTSInterface({ onAuthClick }) {
  const { user, token, updateUsage } = useAuth();
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState(null);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    if (!user) { onAuthClick?.(); return; }

    setLoading(true);
    setError(null);
    setAudioSrc(null);

    try {
      const response = await fetch(`${API_URL}/api/tts/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, speed }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.upgrade) {
          setError("Limite atteinte. Passez à un plan supérieur pour continuer.");
        } else {
          throw new Error(data.error);
        }
        return;
      }

      if (data.audio) {
        setAudioSrc(data.audio);
        updateUsage(data.chars_used, data.chars_limit);
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
    <div>
      <UsageBar />
      <div className="tts-card">
        <div className="textarea-wrapper">
          <textarea
            className="tts-textarea"
            placeholder={user ? "Entrez votre texte ici..." : "Connectez-vous pour générer de la voix..."}
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
            {loading ? <span className="spinner" /> : user ? "Générer la voix" : "Se connecter"}
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
            {error.includes("Limite") && (
              <Link to="/pricing" className="error-upgrade"> Voir les plans</Link>
            )}
          </div>
        )}

        {audioSrc && (
          <div className="audio-player">
            <audio ref={audioRef} controls src={audioSrc} className="audio-element" />
            <button className="btn-download" onClick={handleDownload}>
              Télécharger l'audio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TTSInterface;
