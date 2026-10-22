const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'imagepro.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    item TEXT,
    quantity TEXT,
    method TEXT,
    deadline TEXT,
    contact_pref TEXT,
    details TEXT,
    source TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

  CREATE TABLE IF NOT EXISTS sa_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    visitor TEXT NOT NULL,
    type TEXT NOT NULL,
    path TEXT,
    source TEXT,
    device TEXT,
    label TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sa_ts ON sa_events(ts);
`);

module.exports = db;
