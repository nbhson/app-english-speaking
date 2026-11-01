// ---------- AI provider proxy (key lives in server env, never in the browser) ----------
// Web app calls POST /api/ai/<action>; the server attaches Authorization from
// AI_PROXY_API_KEY before forwarding to the OpenAI-compatible upstream, and
// streams the upstream response back (SSE passthrough). Browser clients are
// already gated by the CORS allowlist; for extra hardening of non-browser
// local callers set AI_PROXY_TOKEN and the client must send it as Bearer.
const { Readable } = require('stream');

const AI_PROXY_BASE_URL = (process.env.AI_PROXY_BASE_URL || 'http://localhost:20128/v1').replace(
  /\/+$/,
  '',
);
const AI_PROXY_API_KEY = process.env.AI_PROXY_API_KEY || '';
const AI_PROXY_TOKEN = process.env.AI_PROXY_TOKEN || '';

function setupProxy(app) {
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
}

module.exports = { setupProxy, AI_PROXY_BASE_URL, AI_PROXY_API_KEY, AI_PROXY_TOKEN };
