const express = require("express");
const router = express.Router();
const db = require("../db/database");
const { requireAuth, checkUsage } = require("../middleware/auth");

const HF_API_URL =
  process.env.HF_API_URL ||
  "https://openbmb-voxcpm-demo.hf.space/api/predict";

router.post("/generate", requireAuth, checkUsage, async (req, res) => {
  const { text, speed = 1.0 } = req.body;

  try {
    const { default: fetch } = await import("node-fetch");

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [text, speed] }),
    });

    if (!response.ok) throw new Error(`HuggingFace API error: ${response.status}`);

    const result = await response.json();
    const audioData = result.data?.[0];

    // Update character usage
    db.prepare("UPDATE users SET chars_used = chars_used + ? WHERE id = ?")
      .run(req.charsToUse, req.user.id);

    const updatedUser = db.prepare("SELECT chars_used, chars_limit FROM users WHERE id = ?")
      .get(req.user.id);

    res.json({
      audio: audioData,
      chars_used: updatedUser.chars_used,
      chars_limit: updatedUser.chars_limit,
    });
  } catch (error) {
    console.error("TTS Error:", error.message);
    res.status(500).json({ error: "Erreur lors de la génération audio." });
  }
});

module.exports = router;
