// ---------- Routes: Sessions (+ embedded messages) ----------
const { db } = require('../db');
const { uid, intOr } = require('../util');
const { scopeId } = require('./auth');

function registerSessionRoutes(app) {
  app.get('/api/sessions', (req, res) => {
    // Clamp >= 1: limit=-1 trước đây thành SQLite LIMIT -1 (unbounded payload).
    const limit = Math.max(1, Math.min(intOr(req.query.limit, 100), 500));
    const sessions = db
      .prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(scopeId(req), limit);
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
    // Coerce mọi trường số: giá trị NaN/không phải số làm SQLite throw 500.
    // Strings (mode) bị cap độ dài — body 5MB không được ghi cả vào DB.
    const num = (v) => Math.max(0, intOr(v, 0));
    const mode = typeof s.mode === 'string' && s.mode.trim() ? s.mode.trim().slice(0, 40) : 'daily';
    const startedAt = Math.max(0, intOr(s.startedAt, Date.now()));
    const endedAt = Math.max(0, intOr(s.endedAt, Date.now()));
    const durationSec = Math.min(num(s.durationSec), 86_400);
    const turns = Math.min(num(s.turns), 10_000);
    const corrections = Math.min(num(s.corrections), 10_000);
    const avgScore = Math.max(0, Math.min(intOr(s.avgScore, 0), 5));
    const vocabPoints = Math.max(0, intOr(s.vocabPoints, 0));
    const confidence = Math.max(0, Math.min(intOr(s.confidence, 0), 100));
    const insSession = db.prepare(
      `INSERT INTO sessions (user_id, id, mode, started_at, ended_at, duration_sec, turns, corrections, avg_score, vocab_points, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        scopeId(req),
        id,
        mode,
        startedAt,
        endedAt,
        durationSec,
        turns,
        corrections,
        avgScore,
        vocabPoints,
        confidence,
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
    db.prepare('DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)').run(scopeId(req));
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(scopeId(req));
    res.json({ ok: true });
  });
}

module.exports = { registerSessionRoutes };
