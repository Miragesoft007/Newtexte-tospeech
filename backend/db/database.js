const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "app.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    chars_used INTEGER NOT NULL DEFAULT 0,
    chars_limit INTEGER NOT NULL DEFAULT 3000,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    reset_date TEXT NOT NULL DEFAULT (strftime('%Y-%m', 'now')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
