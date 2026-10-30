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
const { Readable } = require('stream');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 8241);
const DB_PATH =
  process.env.DB_PATH || path.resolve(__dirname, '..', '..', '..', 'data', 'fluentdev.db');

// --- AI provider proxy (key lives in server env, never in the browser) ---
// Web app calls POST /api/ai/<action>; the server attaches Authorization from
// AI_PROXY_API_KEY before forwarding to the OpenAI-compatible upstream, and
// streams the upstream response back (SSE passthrough). Browser clients are
// already gated by the CORS allowlist; for extra hardening of non-browser
// local callers set AI_PROXY_TOKEN and the client must send it as Bearer.
const AI_PROXY_BASE_URL = (process.env.AI_PROXY_BASE_URL || 'http://localhost:20128/v1').replace(
  /\/+$/,
  '',
);
const AI_PROXY_API_KEY = process.env.AI_PROXY_API_KEY || '';
const AI_PROXY_TOKEN = process.env.AI_PROXY_TOKEN || '';

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

const uid = () => crypto.randomUUID();

// ---------- Auth helpers (node:crypto — zero deps) ----------
// Password: scrypt 64 bytes + 16-byte salt, format "scrypt:<salt>:<hash>".
// Session token: 32 random bytes, client giữ token trong httpOnly cookie,
// server chỉ lưu sha256(token) trong auth_sessions (leak DB ≠ leak token).
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 ngày
const SESSION_COOKIE = 'fd_session';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split(':');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}

// YYYY-MM-DD theo giờ local (không phải UTC) — khớp todayKey() của web client.
const localDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

// ---------- AI proxy ----------
// Raw-body parser scoped to /api/ai — MUST be mounted before express.json so
// multipart audio uploads aren't consumed and JSON bodies stay byte-exact
// when passed through to the upstream.
app.use('/api/ai', express.raw({ type: () => true, limit: '25mb' }));

// Optional client→proxy auth: only enforced when AI_PROXY_TOKEN is set.
// GET /api/ai/status stays open — it's a readiness probe for the Settings UI
// and reveals nothing but a boolean.
app.use('/api/ai', (req, res, next) => {
  if (req.method === 'GET' || !AI_PROXY_TOKEN) return next();
  if (req.headers.authorization === `Bearer ${AI_PROXY_TOKEN}`) return next();
  return res.status(401).json({ error: 'proxy token required' });
});

app.get('/api/ai/status', (_req, res) => {
  // hasKey lets the Settings UI be honest about whether the proxy can
  // authenticate upstream (no key = only gateways that need none).
  res.json({ ok: true, proxy: true, hasKey: Boolean(AI_PROXY_API_KEY) });
});

// Whitelisted actions only — the client may NOT pick an arbitrary upstream
// path (this must never turn into an open relay). Regex route so
// `chat/completions` (with its slash) matches in one segment-free pattern.
app.post(/^\/api\/ai\/(chat\/completions|audio\/transcriptions|audio\/speech)$/, async (req, res) => {
  const action = req.params[0];
  const headers = { 'Content-Type': req.headers['content-type'] || 'application/json' };
  // Upstream credentials come from server env; any client-supplied
  // Authorization is dropped (it was the proxy token, not an upstream key).
  if (AI_PROXY_API_KEY) headers.Authorization = `Bearer ${AI_PROXY_API_KEY}`;
  const upstream = new AbortController();
  // Client hung up mid-stream (user pressed stop) → cancel the upstream call.
  res.on('close', () => {
    if (!res.writableEnded) upstream.abort();
  });
  try {
    const r = await fetch(`${AI_PROXY_BASE_URL}/${action}`, {
      method: 'POST',
      headers,
      body: req.body && req.body.length ? req.body : undefined,
      signal: upstream.signal,
    });
    const ctype = r.headers.get('content-type');
    if (ctype) res.setHeader('Content-Type', ctype);
    res.status(r.status);
    if (r.body) Readable.fromWeb(r.body).pipe(res);
    else res.end();
  } catch (e) {
    // Don't leak the upstream URL/key to the client; details go to the log.
    console.error(`[library-api] ai proxy ${action} failed:`, e instanceof Error ? e.message : e);
    if (!res.headersSent) res.status(502).json({ error: 'AI upstream unreachable' });
    else res.end();
  }
});

app.use(
  cors({
    credentials: true, // httpOnly cookie fd_session (auth) — web/server khác port
    origin(origin, cb) {
      // cb(null, false) = không set CORS headers → browser tự chặn request.
      // (throw ở đây sẽ thành 500 JSON — header không được thêm khi đó.)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  }),
);
app.use(express.json({ limit: '5mb' }));

// ---------- Auth: req.user từ fd_session cookie (null = anonymous) ----------
app.use((req, _res, next) => {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) {
    const row = db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(sha256(token));
    if (row && row.expires_at > Date.now()) {
      req.user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(row.user_id) || null;
    }
  }
  next();
});

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

// ---------- Auth: register / login / logout / me ----------
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

// ---------- Mistakes ----------
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

// ---------- Vocab ----------
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

// ---------- Tasks (practice checklist do user tự đăng ký) ----------
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

// ---------- Progress ----------
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
