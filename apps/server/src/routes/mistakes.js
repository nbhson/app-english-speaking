// ---------- Routes: Mistakes ----------
const { db } = require('../db');
const { uid, bool } = require('../util');
const { scopeId } = require('./auth');

function registerMistakeRoutes(app) {
  app.get('/api/mistakes', (req, res) => {
    res.json(
      db
        .prepare('SELECT * FROM mistakes WHERE user_id = ? ORDER BY created_at DESC LIMIT 300')
        .all(scopeId(req))
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
    // Cap độ dài từng field: body 5MB không được ghi thẳng cả vào SQLite.
    const s = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
    const original = s(b.original, 2000);
    if (!original) return res.status(400).json({ error: 'original required' });
    const existing = db
      .prepare('SELECT * FROM mistakes WHERE user_id = ? AND original = ?')
      .get(scopeId(req), original);
    if (existing) return res.json({ id: existing.id, deduped: true });
    const id = uid();
    db.prepare(
      `INSERT INTO mistakes (user_id, id, original, corrected, alternative, explanation, mode, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      scopeId(req),
      id,
      original,
      s(b.corrected, 2000),
      s(b.alternative, 2000),
      s(b.explanation, 4000),
      s(b.mode, 40),
      Date.now(),
    );
    res.status(201).json({ id });
  });

  app.patch('/api/mistakes/:id', (req, res) => {
    const b = req.body || {};
    const cur = db
      .prepare('SELECT * FROM mistakes WHERE id = ? AND user_id = ?')
      .get(req.params.id, scopeId(req));
    if (!cur) return res.status(404).json({ error: 'not found' });
    // Clamp reviewCount (0..10000): giá trị âm/huge từ client làm hỏng lịch SRS.
    let reviewCount = cur.review_count;
    if (typeof b.reviewCount === 'number') {
      reviewCount = Math.max(0, Math.min(10_000, Math.trunc(b.reviewCount)));
    } else if (b.reviewed === true) {
      reviewCount = Math.min(cur.review_count + 1, 10_000);
    }
    const mastered = typeof b.mastered === 'boolean' ? bool(b.mastered) : cur.mastered;
    db.prepare('UPDATE mistakes SET review_count = ?, mastered = ? WHERE id = ?').run(
      reviewCount,
      mastered,
      req.params.id,
    );
    res.json({ ok: true });
  });

  app.delete('/api/mistakes/:id', (req, res) => {
    db.prepare('DELETE FROM mistakes WHERE id = ? AND user_id = ?').run(req.params.id, scopeId(req));
    res.json({ ok: true });
  });
}

module.exports = { registerMistakeRoutes };
