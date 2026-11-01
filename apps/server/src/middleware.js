// Express middleware setup — THỨ TỰ là hợp đồng hành vi: raw parser cho
// /api/ai PHẢI mount TRƯỚC express.json (xem comment ở dưới + regression
// script scripts/verify-ai-body-order.js).
const express = require('express');
const cors = require('cors');

// Chỉ các origin dev-local của web app được gọi API — chặn mọi trang web khác
// truy cập dữ liệu sessions/transcripts qua localhost của user.
const ALLOWED_ORIGINS = (process.env.LIBRARY_ORIGIN || 'http://localhost:8240,http://127.0.0.1:8240')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function setupMiddleware(app) {
  app.use(
    cors({
      // httpOnly cookie fd_session (auth) — web/server khác port nên fetch dùng
      // credentials: 'include'; thiếu flag này browser chặn CẢ preflight lẫn
      // response với lỗi network im lặng ("Không kết nối được Library server").
      credentials: true,
      origin(origin, cb) {
        // cb(null, false) = không set CORS headers → browser tự chặn request.
        // (throw ở đây sẽ thành 500 JSON — header không được thêm khi đó.)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
    }),
  );
  // Raw-body parser scoped to /api/ai — MUST be mounted before express.json so
  // multipart audio uploads aren't consumed and JSON bodies stay byte-exact
  // when passed through to the upstream. (Ordering is critical: if express.json
  // runs first it consumes the request stream, and the proxy below then forwards
  // an EMPTY body to the AI upstream.)
  app.use('/api/ai', express.raw({ type: () => true, limit: '25mb' }));
  app.use(express.json({ limit: '5mb' }));
}

module.exports = { setupMiddleware, ALLOWED_ORIGINS };
