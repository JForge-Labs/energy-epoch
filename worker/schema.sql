-- Energy Epoch D1 schema (applied to the remote DB via the CF API; kept here
-- for local `wrangler dev` and repeatability).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  ip TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  map_json TEXT,
  save_version INTEGER,
  r2_key TEXT NOT NULL,
  size INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_saves_user ON saves(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_email ON login_tokens(email);
