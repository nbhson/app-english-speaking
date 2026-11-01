// ---------- Routes: Vocab ----------
const { db } = require('../db');
const { uid } = require('../util');
const { scopeId } = require('./auth');

function registerVocabRoutes(app) {
  app.get('/api/vocab', (req, res) => {
    res.json(
      db
        .prepare('SELECT * FROM vocab WHERE user_id = ? ORDER BY created_at DESC LIMIT 500')
        .all(scopeId(req))
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
    if (typeof b.word !== 'string' || !b.word.trim()) return res.status(400).json({ error: 'word required' });
    const existing = db
      .prepare('SELECT * FROM vocab WHERE user_id = ? AND word = ?')
      .get(scopeId(req), b.word.toLowerCase());
    if (existing) return res.json({ id: existing.id, deduped: true });
    const id = uid();
    db.prepare(
      `INSERT INTO vocab (user_id, id, word, translation, ipa, example, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      scopeId(req),
      id,
      b.word.toLowerCase().slice(0, 60),
      typeof b.translation === 'string' ? b.translation.slice(0, 200) : '',
      typeof b.ipa === 'string' ? b.ipa.slice(0, 60) : '',
      typeof b.example === 'string' ? b.example.slice(0, 300) : '',
      Date.now(),
    );
    res.status(201).json({ id });
  });

  app.delete('/api/vocab/:id', (req, res) => {
    db.prepare('DELETE FROM vocab WHERE id = ? AND user_id = ?').run(req.params.id, scopeId(req));
    res.json({ ok: true });
  });
}

module.exports = { registerVocabRoutes };
