// ---------- Auth routes: register / login / logout / me ----------
const { db } = require('../db');
const { uid, hashPassword, verifyPassword, sha256, parseCookies } = require('../util');
const {
  SESSION_COOKIE,
  scopeId,
  createAuthSession,
  adoptAnonymous,
  clearSessionCookie,
  valUsername,
  authRateLimited,
  DUMMY_HASH,
} = require('../auth');

function registerAuthRoutes(app) {
  app.post('/api/auth/register', (req, res) => {
    const b = req.body || {};
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!valUsername(username)) return res.status(400).json({ error: 'username 3-32 ký tự (a-z, 0-9, _ . -)' });
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
      return res.status(400).json({ error: 'password cần từ 6 đến 200 ký tự' });
    }
    const rlKey = `reg:${req.ip}:${username.toLowerCase()}`;
    if (authRateLimited(rlKey)) return res.status(429).json({ error: 'Thử lại sau một phút' });
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      return res.status(409).json({ error: 'username đã tồn tại — chọn tên khác' });
    }
    const id = uid();
    db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      username,
      hashPassword(password),
      Date.now(),
    );
    adoptAnonymous(id); // dữ liệu local/trước đó của browser này → account mới
    createAuthSession(req, res, id);
    res.status(201).json({ user: { id, username } });
  });

  app.post('/api/auth/login', (req, res) => {
    const b = req.body || {};
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    // Rate limit TRƯỚC verify: 10+ lần thử (đúng hay sai) trong 1 phút → 429.
    // Key theo IP+username nên kẻ khác đăng nhập cùng tài khoản từ IP khác
    // không bị ảnh hưởng, và user bị spam không chặn được user khác.
    if (valUsername(username) && authRateLimited(`login:${req.ip}:${username.toLowerCase()}`)) {
      return res.status(429).json({ error: 'Quá nhiều lần thử — chờ một phút rồi thử lại' });
    }
    const user = valUsername(username)
      ? db.prepare('SELECT * FROM users WHERE username = ?').get(username)
      : null;
    const ok = user ? verifyPassword(password, user.password_hash) : verifyPassword(password, DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).json({ error: 'username hoặc password không đúng' });
    }
    adoptAnonymous(user.id);
    createAuthSession(req, res, user.id);
    res.json({ user: { id: user.id, username: user.username } });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha256(token));
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });
}

// scopeId được re-export cho routes khác dùng chung.
module.exports = { registerAuthRoutes, scopeId };
