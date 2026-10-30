PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0,
  corrections INTEGER NOT NULL DEFAULT 0,
  avg_score REAL NOT NULL DEFAULT 0,
  vocab_points INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0
);
-- Lưu ý: index idx_sessions_user / idx_tasks_user được tạo trong index.js
-- SAU migration user_id — trên DB legacy, CREATE INDEX tại đây sẽ lỗi
-- "no such column: user_id" vì bảng cũ chưa có cột này.

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  suggestion TEXT,
  wpm INTEGER,
  filler_count INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

CREATE TABLE IF NOT EXISTS mistakes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  original TEXT NOT NULL,
  corrected TEXT NOT NULL DEFAULT '',
  alternative TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT '',
  review_count INTEGER NOT NULL DEFAULT 0,
  mastered INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, original)
);

CREATE TABLE IF NOT EXISTS vocab (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  word TEXT NOT NULL,
  translation TEXT NOT NULL DEFAULT '',
  ipa TEXT NOT NULL DEFAULT '',
  example TEXT NOT NULL DEFAULT '',
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, word)
);

CREATE TABLE IF NOT EXISTS progress_days (
  user_id TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  minutes INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at INTEGER,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

-- ---------- Auth (đơn giản: username + password, scrypt, cookie session) ----------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,           -- sha256(token) — token gốc chỉ client giữ
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
