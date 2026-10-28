// FluentDev Library API — Express + SQLite (node:sqlite, zero native deps).
// DB file lives in <repo>/data/fluentdev.db (override with DB_PATH).
// No auth: local-first single-user store. CORS bị giới hạn về web app origin
// (mặc định localhost:8240, override bằng LIBRARY_ORIGIN) — cors() trần là
// mở cửa cho MỌI website trong browser đọc/xóa SQLite library qua localhost.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 8241);
const DB_PATH =
  process.env.DB_PATH || path.resolve(__dirname, '..', '..', '..', 'data', 'fluentdev.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));

const uid = () => crypto.randomUUID();

const app = express();
// Chỉ các origin dev-local của web app được gọi API — chặn mọi trang web khác
// truy cập dữ liệu sessions/transcripts qua localhost của user.
const ALLOWED_ORIGINS = (process.env.LIBRARY_ORIGIN || 'http://localhost:8240,http://127.0.0.1:8240')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // cb(null, false) = không set CORS headers → browser tự chặn request.
      // (throw ở đây sẽ thành 500 JSON — header không được thêm khi đó.)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  }),
);
app.use(express.json({ limit: '5mb' }));

const bool = (v) => (v ? 1 : 0);
// Coerce user input to a finite integer; SQLite throws on NaN bindings.
const intOr = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

app.get('/api/health', (_req, res) => res.json({ ok: true })); // không lộ DB_PATH
// ---------- Sessions (+ embedded messages) ----------
app.get('/api/sessions', (req, res) => {
  // Clamp >= 1: limit=-1 trước đây thành SQLite LIMIT -1 (unbounded payload).
  const limit = Math.max(1, Math.min(intOr(req.query.limit, 100), 500));
  const sessions = db
    .prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?')
    .all(limit);
  // Fetch all messages for the page in ONE query (keeps payload flat, avoids N+1).
  const messagesBySession = new Map();
  if (sessions.length > 0) {
    const placeholders = sessions.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT * FROM messages WHERE session_id IN (${placeholders}) ORDER BY created_at ASC`,
      )
      .all(...sessions.map((s) => s.id));
    for (const m of rows) {
      const list = messagesBySession.get(m.session_id);
      if (list) list.push(m);
      else messagesBySession.set(m.session_id, [m]);
    }
  }
  const toMessage = (m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    timestamp: m.created_at,
    ...(m.suggestion ? { suggestion: m.suggestion } : {}),
    ...(m.wpm != null ? { wpm: m.wpm } : {}),
    ...(m.filler_count != null ? { fillerCount: m.filler_count } : {}),
  });
  res.json(
    sessions.map((s) => ({
      id: s.id,
      mode: s.mode,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      durationSec: s.duration_sec,
      turns: s.turns,
      corrections: s.corrections,
      avgScore: s.avg_score,
      vocabPoints: s.vocab_points,
      confidence: s.confidence,
      transcript: (messagesBySession.get(s.id) ?? []).map(toMessage),
    })),
  );
});

app.post('/api/sessions', (req, res) => {
  const s = req.body || {};
  if (!s.startedAt) return res.status(400).json({ error: 'startedAt required' });
  // id/role do SERVER sinh/validate: client id trùng trước đây rollback cả
  // session; role bất kỳ làm bẩn schema.
  const VALID_ROLES = new Set(['user', 'model', 'system']);
  const transcript = (Array.isArray(s.transcript) ? s.transcript : [])
    .slice(0, 1000)
    .map((m) => ({
      role: VALID_ROLES.has(m?.role) ? m.role : 'user',
      text: typeof m?.text === 'string' ? m.text.slice(0, 100_000) : '',
      suggestion: typeof m?.suggestion === 'string' ? m.suggestion.slice(0, 5000) : null,
      wpm: Number.isFinite(Number(m?.wpm)) ? Number(m.wpm) : null,
      fillerCount: Number.isFinite(Number(m?.fillerCount)) ? Number(m.fillerCount) : null,
      timestamp: Number.isFinite(Number(m?.timestamp)) ? Number(m.timestamp) : Date.now(),
    }));
  const id = uid();
  const insSession = db.prepare(
    `INSERT INTO sessions (id, mode, started_at, ended_at, duration_sec, turns, corrections, avg_score, vocab_points, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insMsg = db.prepare(
    `INSERT INTO messages (id, session_id, role, text, suggestion, wpm, filler_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Session + messages go in atomically: a failed message insert must not leave
  // an empty session row behind.
  db.exec('BEGIN');
  try {
    insSession.run(
      id,
      s.mode || 'daily',
      s.startedAt,
      s.endedAt || Date.now(),
      s.durationSec || 0,
      s.turns || 0,
      s.corrections || 0,
      s.avgScore || 0,
      s.vocabPoints || 0,
      s.confidence || 0,
    );
    for (const m of transcript) {
      insMsg.run(uid(), id, m.role, m.text, m.suggestion, m.wpm, m.fillerCount, m.timestamp);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.status(201).json({ id });
});

app.delete('/api/sessions', (req, res) => {
  // Xóa TOÀN BỘ library — phải có confirm body tường minh, tránh một request
  // nhầm (hoặc tab khác gọi qua localhost) mất sạch transcripts.
  if (req.body?.confirm !== 'DELETE ALL') {
    return res.status(400).json({ error: 'confirm required', hint: 'send {"confirm":"DELETE ALL"}' });
  }
  db.prepare('DELETE FROM messages').run();
  db.prepare('DELETE FROM sessions').run();
  res.json({ ok: true });
});

// ---------- Mistakes ----------
app.get('/api/mistakes', (_req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM mistakes ORDER BY created_at DESC LIMIT 300')
      .all()
      .map((m) => ({
        id: m.id,
        original: m.original,
        corrected: m.corrected,
        alternative: m.alternative,
        explanation: m.explanation,
        mode: m.mode,
        createdAt: m.created_at,
        reviewCount: m.review_count,
        mastered: !!m.mastered,
      })),
  );
});

app.post('/api/mistakes', (req, res) => {
  const b = req.body || {};
  if (!b.original) return res.status(400).json({ error: 'original required' });
  const existing = db.prepare('SELECT * FROM mistakes WHERE original = ?').get(b.original);
  if (existing) return res.json({ id: existing.id, deduped: true });
  const id = uid();
  db.prepare(
    `INSERT INTO mistakes (id, original, corrected, alternative, explanation, mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, b.original, b.corrected || '', b.alternative || '', b.explanation || '', b.mode || '', Date.now());
  res.status(201).json({ id });
});

app.patch('/api/mistakes/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM mistakes WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const reviewCount =
    typeof b.reviewCount === 'number' ? b.reviewCount : cur.review_count + (b.reviewed ? 1 : 0);
  const mastered = typeof b.mastered === 'boolean' ? bool(b.mastered) : cur.mastered;
  db.prepare('UPDATE mistakes SET review_count = ?, mastered = ? WHERE id = ?').run(
    reviewCount,
    mastered,
    req.params.id,
  );
  res.json({ ok: true });
});

app.delete('/api/mistakes/:id', (req, res) => {
  db.prepare('DELETE FROM mistakes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Vocab ----------
app.get('/api/vocab', (_req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM vocab ORDER BY created_at DESC LIMIT 500')
      .all()
      .map((v) => ({
        id: v.id,
        word: v.word,
        translation: v.translation,
        ipa: v.ipa,
        example: v.example,
        createdAt: v.created_at,
        reviewCount: v.review_count,
      })),
  );
});

app.post('/api/vocab', (req, res) => {
  const b = req.body || {};
  if (!b.word) return res.status(400).json({ error: 'word required' });
  const existing = db.prepare('SELECT * FROM vocab WHERE word = ?').get(b.word.toLowerCase());
  if (existing) return res.json({ id: existing.id, deduped: true });
  const id = uid();
  db.prepare(
    `INSERT INTO vocab (id, word, translation, ipa, example, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, b.word.toLowerCase(), b.translation || '', b.ipa || '', b.example || '', Date.now());
  res.status(201).json({ id });
});

app.delete('/api/vocab/:id', (req, res) => {
  db.prepare('DELETE FROM vocab WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Tasks (practice checklist do user tự đăng ký) ----------
app.get('/api/tasks', (_req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM tasks ORDER BY completed ASC, created_at DESC LIMIT 200')
      .all()
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        dueAt: t.due_at,
        completed: !!t.completed,
        completedAt: t.completed_at,
        createdAt: t.created_at,
      })),
  );
});

app.post('/api/tasks', (req, res) => {
  const b = req.body || {};
  if (typeof b.title !== 'string' || !b.title.trim()) {
    return res.status(400).json({ error: 'title required' });
  }
  // dueAt ngoài khoảng 2000..2100 coi như rác → null thay vì lưu timestamp lỗi.
  const due = Number(b.dueAt);
  const dueAt = Number.isFinite(due) && due > 946_684_800_000 && due < 4_102_444_800_000 ? Math.trunc(due) : null;
  const id = uid();
  db.prepare(
    `INSERT INTO tasks (id, title, description, due_at, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, b.title.trim().slice(0, 300), typeof b.description === 'string' ? b.description.slice(0, 2000) : '', dueAt, Date.now());
  res.status(201).json({ id });
});

app.patch('/api/tasks/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  const completed = typeof b.completed === 'boolean' ? bool(b.completed) : !!cur.completed;
  db.prepare('UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?').run(
    bool(completed),
    completed ? Date.now() : null,
    req.params.id,
  );
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Progress ----------
app.get('/api/progress', (_req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM progress_days ORDER BY date DESC LIMIT 90')
      .all()
      .map((d) => ({ date: d.date, sessions: d.sessions, minutes: d.minutes, xp: d.xp })),
  );
});

app.post('/api/progress/log', (req, res) => {
  const b = req.body || {};
  // Clamp >= 0 + sane max: trước đây xp/durationSec âm hoặc khổng lồ ghi thẳng
  // vào progress → XP/streak poisoning.
  const durationSec = Math.max(0, Math.min(intOr(b.durationSec, 0), 24 * 3600));
  const xp = Math.max(0, Math.min(intOr(b.xp, 0), 10_000));
  const date = new Date().toISOString().slice(0, 10);
  const cur = db.prepare('SELECT * FROM progress_days WHERE date = ?').get(date);
  if (cur) {
    db.prepare(
      'UPDATE progress_days SET sessions = sessions + 1, minutes = minutes + ?, xp = xp + ? WHERE date = ?',
    ).run(Math.round(durationSec / 60), xp, date);
  } else {
    db.prepare('INSERT INTO progress_days (date, sessions, minutes, xp) VALUES (?, 1, ?, ?)').run(
      date,
      Math.round(durationSec / 60),
      xp,
    );
  }
  const days = db.prepare('SELECT * FROM progress_days ORDER BY date DESC LIMIT 90').all();
  const set = new Set(days.map((d) => d.date));
  const key = (d) => d.toISOString().slice(0, 10);
  let streak = 0;
  const curDate = new Date();
  if (!set.has(key(curDate))) curDate.setDate(curDate.getDate() - 1);
  while (set.has(key(curDate))) {
    streak++;
    curDate.setDate(curDate.getDate() - 1);
  }
  res.json({ streak });
});

const server = app.listen(PORT, () => {
  console.log(`[library-api] listening on http://localhost:${PORT} (db: ${DB_PATH})`);
});
// Surface port-in-use etc. as a readable message instead of a raw stack trace.
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[library-api] port ${PORT} is already in use. Set PORT=<other> and retry.`);
  } else {
    console.error('[library-api] server error:', err && err.message ? err.message : err);
  }
  process.exitCode = 1;
});

// Safety net: log stray async failures (full stack) instead of Node's default
// crash taking `node --watch` down mid-session.
process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  console.error('[library-api] unhandled rejection:', detail);
});

// JSON error handler — must be registered last. Gives clients a predictable
// { error } payload instead of Express's HTML/stack-trace 500. Chi tiết lỗi
// (SQL shape, file paths) chỉ vào log server, KHÔNG trả client.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[library-api] unhandled error:', err instanceof Error ? (err.stack ?? err.message) : err);
  const status = err && err.status ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : String(err.message) });
});
