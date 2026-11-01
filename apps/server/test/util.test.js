// Unit tests cho các pure helpers (không đụng DB/app).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  uid,
  hashPassword,
  verifyPassword,
  sha256,
  parseCookies,
  localDateKey,
  bool,
  intOr,
} = require('../src/util');

test('uid trả UUID duy nhất', () => {
  const a = uid();
  const b = uid();
  assert.match(a, /^[0-9a-f-]{36}$/);
  assert.notEqual(a, b);
});

test('hashPassword/verifyPassword roundtrip + sai password/sai format', () => {
  const stored = hashPassword('s3cret-pass');
  assert.match(stored, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(verifyPassword('s3cret-pass', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
  assert.equal(verifyPassword('x', 'garbage'), false);
  assert.equal(verifyPassword('x', ''), false);
  assert.equal(verifyPassword('x', 'md5:aa:bb'), false);
});

test('sha256 ổn định', () => {
  assert.equal(sha256('abc'), sha256('abc'));
  assert.notEqual(sha256('abc'), sha256('abd'));
  assert.equal(sha256('abc'), require('node:crypto').createHash('sha256').update('abc').digest('hex'));
});

test('parseCookies: cặp bình thường, space, không có header, thiếu =', () => {
  assert.deepEqual(parseCookies('a=1; b=two; c=x%20y'), { a: '1', b: 'two', c: 'x y' });
  assert.deepEqual(parseCookies('novalue'), {});
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(undefined), {});
  // '=' tại vị trí 0 (idx > 0) bị bỏ qua.
  assert.deepEqual(parseCookies('=skip; ok=1'), { ok: '1' });
});

test('localDateKey theo giờ local, pad 2 chữ số', () => {
  assert.equal(localDateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(localDateKey(new Date(2026, 10, 20)), '2026-11-20');
});

test('bool/intOr coerce an toàn (SQLite throw khi bind NaN)', () => {
  assert.equal(bool(0), 0);
  assert.equal(bool(1), 1);
  assert.equal(bool('x'), 1);
  assert.equal(intOr('42', 0), 42);
  assert.equal(intOr(3.9, 0), 3); // trunc
  assert.equal(intOr(NaN, 7), 7);
  assert.equal(intOr('abc', 7), 7);
  assert.equal(intOr(Infinity, 7), 7);
  assert.equal(intOr(undefined, 7), 7);
});
