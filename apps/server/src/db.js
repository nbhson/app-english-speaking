// SQLite (node:sqlite, zero native deps) — open, schema, legacy migration.
// DB file lives in <repo>/data/fluentdev.db (override with DB_PATH).
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH =
  process.env.DB_PATH || path.resolve(__dirname, '..', '..', '..', 'data', 'fluentdev.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));

// ---------- Legacy-DB migration: thêm cột user_id ('' = anonymous/local) ----------
// Bảng mới (schema.sql) đã có sẵn user_id; DB cũ cần ALTER/rebuild idempotent.
function tableColumns(name) {
  return db.prepare(`PRAGMA table_info(${name})`).all().map((r) => r.name);
}
function ensureUserIdColumn(name) {
  if (!tableColumns(name).includes('user_id')) {
    db.exec(`ALTER TABLE ${name} ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  }
}
ensureUserIdColumn('sessions');
ensureUserIdColumn('tasks');
// mistakes / vocab: UNIQUE(original|word) toàn cục chặn 2 user học cùng 1 từ →
// rebuild với UNIQUE(user_id, original|word). progress_days: PK(date) cũ chặn
// 2 user cùng ngày → rebuild với PK(user_id, date). Copy giữ user_id='' (anon).
function rebuildWithUserId(name, createSql, copyCols) {
  if (tableColumns(name).includes('user_id')) return; // schema mới rồi
  const tmp = `${name}_rebuild`;
  db.exec(`ALTER TABLE ${name} RENAME TO ${tmp}_old`);
  db.exec(createSql);
  db.exec(`INSERT INTO ${name} (user_id, ${copyCols}) SELECT '', ${copyCols} FROM ${tmp}_old`);
  db.exec(`DROP TABLE ${tmp}_old`);
}

rebuildWithUserId(
  'mistakes',
  `CREATE TABLE mistakes (
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
   );`,
  'id, original, corrected, alternative, explanation, mode, review_count, mastered, created_at',
);
rebuildWithUserId(
  'vocab',
  `CREATE TABLE vocab (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL DEFAULT '',
     word TEXT NOT NULL,
     translation TEXT NOT NULL DEFAULT '',
     ipa TEXT NOT NULL DEFAULT '',
     example TEXT NOT NULL DEFAULT '',
     review_count INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     UNIQUE(user_id, word)
   );`,
  'id, word, translation, ipa, example, review_count, created_at',
);
rebuildWithUserId(
  'progress_days',
  `CREATE TABLE progress_days (
     user_id TEXT NOT NULL DEFAULT '',
     date TEXT NOT NULL,
     sessions INTEGER NOT NULL DEFAULT 0,
     minutes INTEGER NOT NULL DEFAULT 0,
     xp INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, date)
   );`,
  'date, sessions, minutes, xp',
);
db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);');

// Dọn session hết hạn — chạy lúc boot + 1 lần/giờ (rows không tự biến mất).
function cleanExpiredSessions() {
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(Date.now());
}
cleanExpiredSessions();
setInterval(cleanExpiredSessions, 3600_000).unref();

module.exports = { db, DB_PATH };
