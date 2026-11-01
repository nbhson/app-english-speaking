// Pure helpers chung cho server (không phụ thuộc app/db).
const crypto = require('crypto');

const uid = () => crypto.randomUUID();

// ---------- Password hashing (node:crypto — zero deps) ----------
// Password: scrypt 64 bytes + 16-byte salt, format "scrypt:<salt>:<hash>".
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

const bool = (v) => (v ? 1 : 0);
// Coerce user input to a finite integer; SQLite throws on NaN bindings.
const intOr = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

module.exports = {
  uid,
  hashPassword,
  verifyPassword,
  sha256,
  parseCookies,
  localDateKey,
  bool,
  intOr,
};
