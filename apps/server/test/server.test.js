// Integration tests: chạy server thật (temp DB + port rảnh, cùng cách với
// scripts/verify-ai-body-order.js) rồi bấm HTTP vào các endpoint chính.
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const test = require('node:test');
const assert = require('node:assert/strict');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let serverProc = null;
let base = null;
let tmpDir = null;

test.before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentdev-itest-'));
  const freePort = await new Promise((resolve, reject) => {
    const s = http.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: {
      ...process.env,
      PORT: String(freePort),
      DB_PATH: path.join(tmpDir, 'test.db'),
      AI_PROXY_TOKEN: 'it-proxy-token',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let port = null;
  let err = '';
  serverProc.stdout.on('data', (d) => {
    const m = String(d).match(/http:\/\/localhost:(\d+)/);
    if (m) port = Number(m[1]);
  });
  serverProc.stderr.on('data', (d) => {
    err += String(d);
  });
  for (let i = 0; i < 50 && port == null; i++) await wait(100);
  if (port == null) throw new Error(`server did not start: ${err}`);
  base = `http://127.0.0.1:${port}`;
});

test.after(() => {
  if (serverProc) serverProc.kill();
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function req(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

test('GET /api/health → 200 {ok:true}', async () => {
  const r = await req('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
});

test('endpoint không tồn tại → 404', async () => {
  const r = await req('GET', '/api/khong-ton-tai');
  assert.equal(r.status, 404);
});

test('POST /api/sessions thiếu startedAt → 400; hợp lệ → 201 rồi GET list trả transcript', async () => {
  const bad = await req('POST', '/api/sessions', {});
  assert.equal(bad.status, 400);
  assert.ok(bad.json.error);

  const ok = await req('POST', '/api/sessions', {
    startedAt: 1000,
    endedAt: 2000,
    mode: 'free-talk',
    avgScore: 99, // clamp về 5
    durationSec: -5, // clamp về 0
    transcript: [
      { role: 'model', text: 'hello', suggestion: 'Hi!', wpm: 120, fillerCount: 2 },
      { role: 'hacker', text: 'x' }, // role lạ → 'user'
    ],
  });
  assert.equal(ok.status, 201);
  assert.ok(ok.json.id);

  const list = await req('GET', '/api/sessions');
  assert.equal(list.status, 200);
  const s = list.json.find((x) => x.id === ok.json.id);
  assert.equal(s.mode, 'free-talk');
  assert.equal(s.avgScore, 5);
  assert.equal(s.durationSec, 0);
  assert.equal(s.transcript.length, 2);
  assert.equal(s.transcript[0].text, 'hello');
  assert.equal(s.transcript[0].suggestion, 'Hi!');
  assert.equal(s.transcript[1].role, 'user');
});

test('POST /api/vocab thiếu word → 400; hợp lệ → 201 + dedupe', async () => {
  const bad = await req('POST', '/api/vocab', { translation: 'x' });
  assert.equal(bad.status, 400);
  const ok = await req('POST', '/api/vocab', { word: 'Serendipity', translation: 'tình cờ may mắn' });
  assert.equal(ok.status, 201);
  const dup = await req('POST', '/api/vocab', { word: 'serendipity' }); // lowercase match
  assert.equal(dup.status, 200);
  assert.equal(dup.json.deduped, true);
  const list = await req('GET', '/api/vocab');
  assert.equal(list.json.filter((v) => v.word === 'serendipity').length, 1);
});

test('POST /api/mistakes thiếu original → 400', async () => {
  const r = await req('POST', '/api/mistakes', { corrected: 'x' });
  assert.equal(r.status, 400);
});

test('DELETE /api/sessions không có confirm → 400', async () => {
  const r = await req('DELETE', '/api/sessions', { confirm: 'nope' });
  assert.equal(r.status, 400);
  assert.equal(r.json.hint, 'send {"confirm":"DELETE ALL"}');
});

test('AI proxy: GET /api/ai/status luôn mở; POST không token → 401 (AI_PROXY_TOKEN bật)', async () => {
  const status = await req('GET', '/api/ai/status');
  assert.equal(status.status, 200);
  assert.equal(status.json.ok, true);
  assert.equal(status.json.proxy, true);

  const blocked = await req('POST', '/api/ai/chat/completions', { model: 'm', messages: [] });
  assert.equal(blocked.status, 401);
  assert.equal(blocked.json.error, 'proxy token required');

  const wrongToken = await fetch(base + '/api/ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sai-token' },
    body: JSON.stringify({ model: 'm', messages: [] }),
  });
  assert.equal(wrongToken.status, 401);
});
