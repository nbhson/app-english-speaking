// ---------- Routes: Tasks (practice checklist do user tự đăng ký) ----------
const { db } = require('../db');
const { uid, bool } = require('../util');
const { scopeId } = require('./auth');

function registerTaskRoutes(app) {
  app.get('/api/tasks', (req, res) => {
    res.json(
      db
        .prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY completed ASC, created_at DESC LIMIT 200')
        .all(scopeId(req))
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
      `INSERT INTO tasks (user_id, id, title, description, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(scopeId(req), id, b.title.trim().slice(0, 300), typeof b.description === 'string' ? b.description.slice(0, 2000) : '', dueAt, Date.now());
    res.status(201).json({ id });
  });

  app.patch('/api/tasks/:id', (req, res) => {
    const b = req.body || {};
    const cur = db
      .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
      .get(req.params.id, scopeId(req));
    const completed = typeof b.completed === 'boolean' ? bool(b.completed) : !!cur.completed;
    db.prepare('UPDATE tasks SET completed = ?, completed_at = ? WHERE id = ?').run(
      bool(completed),
      completed ? Date.now() : null,
      req.params.id,
    );
    res.json({ ok: true });
  });

  app.delete('/api/tasks/:id', (req, res) => {
    db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.params.id, scopeId(req));
    res.json({ ok: true });
  });
}

module.exports = { registerTaskRoutes };
