// Unit tests cho auth helpers (validation, rate limit, cookie flags).
// auth.js mở SQLite lúc require → trỏ DB_PATH sang temp DB trước khi import.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentdev-auth-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SESSION_COOKIE,
  scopeId,
  isSecureReq,
  setSessionCookie,
  clearSessionCookie,
  valUsername,
  authRateLimited,
  RATE_LIMIT,
} = require('../src/auth');

test('valUsername: 3-32 ký tự [a-zA-Z0-9_.-]', () => {
  assert.equal(valUsername('abc'), true);
  assert.equal(valUsername('a_b-c.9'), true);
  assert.equal(valUsername('  abc  '), true); // trim bên trong
  assert.equal(valUsername('ab'), false); // < 3
  assert.equal(valUsername('a'.repeat(33)), false); // > 32
  assert.equal(valUsername('có dấu'), false);
  assert.equal(valUsername('a b'), false);
  assert.equal(valUsername(123), false);
  assert.equal(valUsername(null), false);
});

test('scopeId: user login → id, anonymous → ""', () => {
  assert.equal(scopeId({ user: { id: 'u1' } }), 'u1');
  assert.equal(scopeId({ user: null }), '');
  assert.equal(scopeId({}), '');
});

test('isSecureReq: req.secure hoặc x-forwarded-proto: https', () => {
  assert.equal(isSecureReq({ secure: true, headers: {} }), true);
  assert.equal(isSecureReq({ secure: false, headers: { 'x-forwarded-proto': 'https,http' } }), true);
  assert.equal(isSecureReq({ secure: false, headers: { 'x-forwarded-proto': 'http' } }), false);
  assert.equal(isSecureReq({ secure: false, headers: {} }), false);
});

test('setSessionCookie: fd_session httpOnly + Max-Age 30 ngày + SameSite=Lax', () => {
  const headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v) };
  setSessionCookie({ secure: false, headers: {} }, res, 'tok123');
  const cookie = headers['Set-Cookie'];
  assert.ok(cookie.startsWith(`${SESSION_COOKIE}=tok123; HttpOnly`), cookie);
  assert.ok(cookie.includes('Max-Age=' + 30 * 24 * 3600));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(!cookie.includes('Secure'));
});

test('setSessionCookie thêm Secure khi qua https', () => {
  const headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v) };
  setSessionCookie({ secure: false, headers: { 'x-forwarded-proto': 'https' } }, res, 't');
  assert.ok(headers['Set-Cookie'].includes('Secure'));
});

test('clearSessionCookie xoá cookie (Max-Age=0)', () => {
  const headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v) };
  clearSessionCookie(res);
  assert.match(headers['Set-Cookie'], /^fd_session=; HttpOnly; Path=\/; Max-Age=0/);
});

test('authRateLimited: cho phép RATE_LIMIT lần, lần thứ ' + (RATE_LIMIT + 1) + ' bị chặn, key độc lập', () => {
  const key = `login:127.0.0.1:test-${Date.now()}`;
  for (let i = 0; i < RATE_LIMIT; i++) {
    assert.equal(authRateLimited(key), false, `lần ${i + 1}`);
  }
  assert.equal(authRateLimited(key), true); // vượt limit
  assert.equal(authRateLimited(`${key}-other`), false); // key khác không ảnh hưởng
});
