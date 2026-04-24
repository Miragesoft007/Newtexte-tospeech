const express = require("express");
const router = express.Router();

const HF_API_URL =
  process.env.HF_API_URL ||
  "https://openbmb-voxcpm-demo.hf.space/api/predict";

router.post("/generate", async (req, res) => {
  const { text, speed = 1.0 } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Le texte est requis." });
  }

  try {
    const { default: fetch } = await import("node-fetch");

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [text, speed] }),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const result = await response.json();

    // HuggingFace Spaces retourne l'audio en base64 ou URL
    const audioData = result.data?.[0];
    res.json({ audio: audioData });
  } catch (error) {
    console.error("TTS Error:", error.message);
    res.status(500).json({ error: "Erreur lors de la génération audio." });
  }
});

module.exports = router;
