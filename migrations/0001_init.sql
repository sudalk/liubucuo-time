-- 柳不匆 初始化 schema
-- 对应 worker/schema.ts

-- ────────────────────────────────────────────────────────────────
-- 用户与认证
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nickname TEXT,
  avatar_key TEXT,
  timezone TEXT,
  ai_authorized INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_allowlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  allowed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────
-- 核心业务数据
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  first_plan_at TEXT,
  last_plan_at TEXT,
  plan_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS events_user_normalized ON events(user_id, normalized_name);

CREATE TABLE IF NOT EXISTS plan_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  event_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  planned_start_local TEXT,
  estimated_minutes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS plan_items_user_date ON plan_items(user_id, date);

CREATE TABLE IF NOT EXISTS time_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  start_utc TEXT NOT NULL,
  start_local TEXT NOT NULL,
  end_utc TEXT,
  end_local TEXT,
  duration_minutes INTEGER,
  status_progress INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  is_main_sleep INTEGER NOT NULL DEFAULT 0,
  revised_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS time_records_user_start ON time_records(user_id, start_local);

CREATE TABLE IF NOT EXISTS active_timers (
  user_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  start_utc TEXT NOT NULL,
  start_local TEXT NOT NULL,
  status_progress INTEGER DEFAULT 50,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────────────────────────────────────
-- 复盘与 AI
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reflections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  keywords TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS reflections_user_date ON reflections(user_id, date);

CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  keywords TEXT,
  ai_version TEXT,
  user_edited INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS summaries_user_period ON summaries(user_id, period, kind);

CREATE TABLE IF NOT EXISTS need_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  structured TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_outputs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ai_outputs_user_kind ON ai_outputs(user_id, kind);
