// FluentDev Library API — entry point.
// No auth: local-first single-user store. CORS bị giới hạn về web app origin
// (mặc định localhost:8240, override bằng LIBRARY_ORIGIN) — cors() trần là
// mở cửa cho MỌI website trong browser đọc/xóa SQLite library qua localhost.
const express = require('express');
const { DB_PATH } = require('./db');
const { setupMiddleware } = require('./middleware');
const { setupProxy } = require('./proxy');
const { attachUser } = require('./auth');
const { registerAuthRoutes } = require('./routes/auth');
const { registerSessionRoutes } = require('./routes/sessions');
const { registerMistakeRoutes } = require('./routes/mistakes');
const { registerVocabRoutes } = require('./routes/vocab');
const { registerTaskRoutes } = require('./routes/tasks');
const { registerProgressRoutes } = require('./routes/progress');

const PORT = Number(process.env.PORT || 8241);

const app = express();
setupMiddleware(app);
setupProxy(app);
app.use(attachUser);
registerAuthRoutes(app);
app.get('/api/health', (_req, res) => res.json({ ok: true })); // không lộ DB_PATH
registerSessionRoutes(app);
registerMistakeRoutes(app);
registerVocabRoutes(app);
registerTaskRoutes(app);
registerProgressRoutes(app);

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
app.use((err, _req, res, _next) => {
  console.error('[library-api] unhandled error:', err instanceof Error ? (err.stack ?? err.message) : err);
  const status = err && err.status ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : String(err.message) });
});
