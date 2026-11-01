// Regression check (standalone, no test framework): POST JSON to /api/ai
// must reach the upstream WITH its body. Guards the middleware order —
// express.raw('/api/ai') must run BEFORE express.json(), otherwise express.json
// consumes the stream first and the proxy forwards an empty body.
//
// Run: node scripts/verify-ai-body-order.js
// Exit 0 = pass, 1 = fail.

const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Mock upstream: records the body it receives per request.
  const received = [];
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push(Buffer.concat(chunks).toString('utf8'));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  const upstreamPort = upstream.address().port;

  // Isolated server instance: temp DB + random port + mock upstream.
  // (The server logs its PORT env value verbatim, not the OS-assigned one,
  // so grab a genuinely free port ourselves instead of using PORT=0.)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentdev-verify-'));
  const freePort = await new Promise((resolve, reject) => {
    const s = http.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const server = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'src', 'index.js')],
    {
      env: {
        ...process.env,
        PORT: String(freePort),
        DB_PATH: path.join(tmpDir, 'test.db'),
        AI_PROXY_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1`,
        AI_PROXY_API_KEY: 'test-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let serverPort = null;
  server.stdout.on('data', (d) => {
    const m = String(d).match(/http:\/\/localhost:(\d+)/);
    if (m) serverPort = Number(m[1]);
  });
  let serverErr = '';
  server.stderr.on('data', (d) => {
    serverErr += String(d);
  });

  try {
    for (let i = 0; i < 50 && serverPort == null; i++) await wait(100);
    if (serverPort == null) throw new Error(`server did not start: ${serverErr}`);

    const payload = JSON.stringify({
      model: 'test-model',
      messages: [{ role: 'user', content: 'ping' }],
    });
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/ai/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    await res.text();

    const forwarded = received[0];
    if (forwarded === undefined) throw new Error('upstream never received a request');
    if (forwarded !== payload) {
      throw new Error(
        `body lost/changed in proxy (express.json ordering bug): upstream got ${JSON.stringify(forwarded)}`,
      );
    }
    console.log('PASS: /api/ai POST forwarded with full JSON body');
  } finally {
    server.kill();
    upstream.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
