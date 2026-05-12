-- SQLite schema for local development

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  creator_email TEXT NOT NULL,
  qr_token TEXT UNIQUE NOT NULL,
  fallback_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  checked_in INTEGER NOT NULL DEFAULT 0,
  checked_in_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id)
);

CREATE TABLE IF NOT EXISTS event_logs (
  id TEXT PRIMARY KEY,
  group_id TEXT,
  member_id TEXT,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  meta_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_members_group_id ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_group_id ON event_logs(group_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_member_id ON event_logs(member_id);
