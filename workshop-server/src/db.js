// Datenbank (SQLite): Uploads, Sitzungen, Meldungen und Einstellungen.
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "workshop.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      owner_uuid TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      categories TEXT NOT NULL DEFAULT '[]',
      mc_version TEXT NOT NULL DEFAULT '',
      mod_version TEXT NOT NULL DEFAULT '',
      mod_id TEXT NOT NULL DEFAULT '',
      license TEXT NOT NULL DEFAULT '',
      trailer_url TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]',
      icon TEXT NOT NULL DEFAULT '',
      mod_file TEXT NOT NULL DEFAULT '',
      mod_size INTEGER NOT NULL DEFAULT 0,
      source_file TEXT NOT NULL DEFAULT '',
      source_size INTEGER NOT NULL DEFAULT 0,
      -- pending | public | rejected | blocked
      status TEXT NOT NULL DEFAULT 'pending',
      reason TEXT NOT NULL DEFAULT '',
      allow_resubmit INTEGER NOT NULL DEFAULT 1,
      featured INTEGER NOT NULL DEFAULT 0,
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      reviewed_at INTEGER NOT NULL DEFAULT 0,
      reviewed_by TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS items_status ON items(status);
    CREATE INDEX IF NOT EXISTS items_owner ON items(owner_uuid);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      uuid TEXT NOT NULL,
      name TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      reporter_uuid TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS downloads (
      item_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (item_id, day)
    );
    CREATE TABLE IF NOT EXISTS ratings (
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      uuid TEXT NOT NULL,
      stars INTEGER NOT NULL,
      PRIMARY KEY (item_id, uuid)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      uuid TEXT NOT NULL,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS comments_item ON comments(item_id, created_at);
    CREATE TABLE IF NOT EXISTS subscriptions (
      uuid TEXT NOT NULL,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (uuid, item_id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS notifications_user ON notifications(uuid, created_at);
  `);
  // Spalten, die später dazukamen
  const cols = db.prepare("PRAGMA table_info(items)").all().map((c) => c.name);
  if (!cols.includes("dependencies")) db.exec("ALTER TABLE items ADD COLUMN dependencies TEXT NOT NULL DEFAULT '[]'");
  return db;
}

export const DEFAULT_SETTINGS = {
  reviewMods: true,
  reviewSource: true,
  reviewUpdates: false,
};

export function getSettings(db) {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in out) out[r.key] = r.value === "1";
  }
  return out;
}

export function saveSettings(db, s) {
  const stmt = db.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof s[k] === "boolean") stmt.run(k, s[k] ? "1" : "0");
  }
  return getSettings(db);
}
