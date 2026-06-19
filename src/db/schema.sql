-- Barka — schema (раздел 4 ARCHITECTURE.md).
-- ИСТОЧНИК ПРАВДЫ для DDL. Исполняется как migration v1 в client.ts (PRAGMA user_version).
-- БД хранит ТОЛЬКО прогресс и события — НИКОГДА контент.

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  avatar TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER,
  item_id TEXT,
  completed_at INTEGER,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER,
  item_id TEXT,
  event_type TEXT,              -- "open" | "complete" | "choice_correct" | "choice_wrong"
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS installed_packs (
  pack_id TEXT PRIMARY KEY,
  version INTEGER,
  installed_at INTEGER
);

-- Индексы под типовые выборки (прогресс/события по профилю).
CREATE INDEX IF NOT EXISTS idx_progress_profile ON progress (profile_id);
CREATE INDEX IF NOT EXISTS idx_events_profile ON events (profile_id);
