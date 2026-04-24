const jwt = require("jsonwebtoken");
const db = require("../db/database");

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Non authentifié." });
  try {
    const payload = jwt.verify(header.replace("Bearer ", ""), process.env.JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.id);
    if (!user) return res.status(401).json({ error: "Utilisateur introuvable." });

    // Reset usage counter if new month
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (user.reset_date !== currentMonth) {
      db.prepare("UPDATE users SET chars_used = 0, reset_date = ? WHERE id = ?")
        .run(currentMonth, user.id);
      user.chars_used = 0;
      user.reset_date = currentMonth;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Token invalide." });
  }
}

function checkUsage(req, res, next) {
  const { user } = req;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Texte requis." });

  const charsToUse = text.length;

  // -1 = unlimited (Pro plan)
  if (user.chars_limit !== -1) {
    if (user.chars_used + charsToUse > user.chars_limit) {
      return res.status(403).json({
        error: "Limite de caractères atteinte.",
        chars_used: user.chars_used,
        chars_limit: user.chars_limit,
        upgrade: true,
      });
    }
  }

  req.charsToUse = charsToUse;
  next();
}

module.exports = { requireAuth, checkUsage };
