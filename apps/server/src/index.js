// FluentDev Library API — Express + SQLite (node:sqlite, zero native deps).
// DB file lives in <repo>/data/fluentdev.db (override with DB_PATH).
// No auth: local-first single-user store for the desktop/dev setup.

const path = require('path');
const fs = require('fs');
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

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const bool = (v) => (v ? 1 : 0);

app.get('/api/health', (_req, res) => res.json({ ok: true, db: DB_PATH }));

// ---------- Sessions (+ embedded messages) ----------
app.get('/api/sessions', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500);
  const sessions = db
    .prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?')
    .all(limit);
  const byId = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
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
      transcript: byId.all(s.id).map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        timestamp: m.created_at,
        ...(m.suggestion ? { suggestion: m.suggestion } : {}),
        ...(m.wpm != null ? { wpm: m.wpm } : {}),
        ...(m.filler_count != null ? { fillerCount: m.filler_count } : {}),
      })),
    })),
  );
});

app.post('/api/sessions', (req, res) => {
  const s = req.body || {};
  if (!s.startedAt) return res.status(400).json({ error: 'startedAt required' });
  const id = s.id || uid();
  db.prepare(
    `INSERT INTO sessions (id, mode, started_at, ended_at, duration_sec, turns, corrections, avg_score, vocab_points, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  const insMsg = db.prepare(
    `INSERT INTO messages (id, session_id, role, text, suggestion, wpm, filler_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const m of s.transcript || []) {
      insMsg.run(
        m.id || uid(),
        id,
        m.role,
        m.text || '',
        m.suggestion || null,
        m.wpm ?? null,
        m.fillerCount ?? null,
        m.timestamp || Date.now(),
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.status(201).json({ id });
});

app.delete('/api/sessions', (_req, res) => {
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
  const { durationSec = 0, xp = 0 } = req.body || {};
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

app.listen(PORT, () => {
  console.log(`[library-api] listening on http://localhost:${PORT} (db: ${DB_PATH})`);
});
