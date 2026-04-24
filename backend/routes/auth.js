const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db/database");

const router = express.Router();

const PLANS = {
  free:    { limit: 3000 },
  starter: { limit: 100000 },
  pro:     { limit: -1 },
};

router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email et mot de passe requis." });

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing)
    return res.status(409).json({ error: "Email déjà utilisé." });

  const password_hash = await bcrypt.hash(password, 10);
  const result = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(email, password_hash);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.status(201).json({ token, user: safeUser(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email et mot de passe requis." });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user)
    return res.status(401).json({ error: "Identifiants incorrects." });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid)
    return res.status(401).json({ error: "Identifiants incorrects." });

  // Reset usage counter if new month
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (user.reset_date !== currentMonth) {
    db.prepare("UPDATE users SET chars_used = 0, reset_date = ? WHERE id = ?")
      .run(currentMonth, user.id);
    user.chars_used = 0;
  }

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({ token, user: safeUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json({ user: safeUser(user) });
});

function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    chars_used: user.chars_used,
    chars_limit: user.chars_limit,
  };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Non authentifié." });
  try {
    req.user = jwt.verify(header.replace("Bearer ", ""), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token invalide." });
  }
}

module.exports = router;
