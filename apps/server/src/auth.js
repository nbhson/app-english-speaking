// ---------- Auth: helpers, req.user middleware, session cookies ----------
// Session token: 32 random bytes, client giữ token trong httpOnly cookie,
// server chỉ lưu sha256(token) trong auth_sessions (leak DB ≠ leak token).
const crypto = require('crypto');
const { db } = require('./db');
const { hashPassword, verifyPassword, sha256, parseCookies } = require('./util');

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 ngày
const SESSION_COOKIE = 'fd_session';

// user scope hiện tại: user đã login → id của họ; chưa login → '' (anonymous,
// hành vi local-first như cũ — mọi thứ vẫn hoạt động không cần tài khoản).
const scopeId = (req) => (req.user ? req.user.id : '');

// Cookie Secure khi request qua https (reverse proxy / production) — dev
// localhost http giữ nguyên vì browser từ chối set cookie Secure trên http
// thường (localhost được ngoại lệ, nhưng tránh phụ thuộc hành vi đó).
function isSecureReq(req) {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https';
}
function setSessionCookie(req, res, token) {
  const flags = [`fd_session=${token}`, 'HttpOnly', 'Path=/', `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`, 'SameSite=Lax'];
  if (isSecureReq(req)) flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}
function createAuthSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    Date.now(),
    Date.now() + SESSION_TTL_MS,
  );
  setSessionCookie(req, res, token);
}
// Local-first merge-once: lần đầu login (hoặc đăng ký), toàn bộ data ẩn danh
// (đã mirror từ localStorage trước đó) thuộc về user vừa đăng nhập.
function adoptAnonymous(userId) {
  for (const t of ['sessions', 'mistakes', 'vocab', 'tasks', 'progress_days']) {
    db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id = ''`).run(userId);
  }
}

// ---------- req.user từ fd_session cookie (null = anonymous) ----------
function attachUser(req, _res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) {
    const row = db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(sha256(token));
    if (row && row.expires_at > Date.now()) {
      req.user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(row.user_id) || null;
    }
  }
  next();
}

// ---------- Validation + rate limit cho /api/auth/* ----------
const valUsername = (v) => typeof v === 'string' && /^[a-zA-Z0-9_.-]{3,32}$/.test(v.trim());

// Simple in-memory rate limit cho /api/auth/* (đủ cho app local; không cần
// redis): 10 lần / phút / IP+username. Reset dần qua vòng quét định kỳ.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const authAttempts = new Map(); // key → number[] (timestamps)
function authRateLimited(key) {
  const nowTs = Date.now();
  const arr = (authAttempts.get(key) || []).filter((t) => nowTs - t < RATE_WINDOW_MS);
  arr.push(nowTs);
  authAttempts.set(key, arr);
  return arr.length > RATE_LIMIT;
}
setInterval(() => {
  const nowTs = Date.now();
  for (const [k, arr] of authAttempts) {
    const alive = arr.filter((t) => nowTs - t < RATE_WINDOW_MS);
    if (alive.length === 0) authAttempts.delete(k);
    else authAttempts.set(k, alive);
  }
}, RATE_WINDOW_MS).unref();

// Anti username-enumeration: khi user không tồn tại vẫn "verify" với hash giả
// để thời gian phản hồi như login sai password thật (scrypt ~50-100ms).
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  scopeId,
  isSecureReq,
  setSessionCookie,
  clearSessionCookie,
  createAuthSession,
  adoptAnonymous,
  attachUser,
  valUsername,
  authRateLimited,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  DUMMY_HASH,
  verifyPassword,
};
