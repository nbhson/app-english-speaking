// ---------- Routes: Progress ----------
const { db } = require('../db');
const { intOr, localDateKey } = require('../util');
const { scopeId } = require('./auth');

function registerProgressRoutes(app) {
  app.get('/api/progress', (req, res) => {
    res.json(
      db
        .prepare('SELECT * FROM progress_days WHERE user_id = ? ORDER BY date DESC LIMIT 90')
        .all(scopeId(req))
        .map((d) => ({ date: d.date, sessions: d.sessions, minutes: d.minutes, xp: d.xp })),
    );
  });

  app.post('/api/progress/log', (req, res) => {
    const b = req.body || {};
    // Clamp >= 0 + sane max: trước đây xp/durationSec âm hoặc khổng lồ ghi thẳng
    // vào progress → XP/streak poisoning.
    const durationSec = Math.max(0, Math.min(intOr(b.durationSec, 0), 24 * 3600));
    const xp = Math.max(0, Math.min(intOr(b.xp, 0), 10_000));
    const userScope = scopeId(req);
    const date = new Date();
    // Local date (not UTC): user ở VN (UTC+7) học buổi sáng sớm phải tính vào
    // đúng ngày hôm nay của họ, không phải hôm trước theo UTC.
    const dateKey = localDateKey(date);
    const cur = db
      .prepare('SELECT * FROM progress_days WHERE user_id = ? AND date = ?')
      .get(userScope, dateKey);
    if (cur) {
      db.prepare(
        'UPDATE progress_days SET sessions = sessions + 1, minutes = minutes + ?, xp = xp + ? WHERE user_id = ? AND date = ?',
      ).run(Math.round(durationSec / 60), xp, userScope, dateKey);
    } else {
      db.prepare(
        'INSERT INTO progress_days (user_id, date, sessions, minutes, xp) VALUES (?, ?, 1, ?, ?)',
      ).run(userScope, dateKey, Math.round(durationSec / 60), xp);
    }
    const days = db.prepare('SELECT * FROM progress_days WHERE user_id = ? ORDER BY date DESC LIMIT 90').all(userScope);
    const set = new Set(days.map((d) => d.date));
    const key = localDateKey;
    let streak = 0;
    const curDate = new Date();
    if (!set.has(key(curDate))) curDate.setDate(curDate.getDate() - 1);
    while (set.has(key(curDate))) {
      streak++;
      curDate.setDate(curDate.getDate() - 1);
    }
    res.json({ streak });
  });
}

module.exports = { registerProgressRoutes };
