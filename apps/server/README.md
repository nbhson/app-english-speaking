# @fluentdev/library-api

Local-first storage backend for FluentDev's 📚 My Learning Library.
Express + SQLite via Node's built-in `node:sqlite` (no native deps).

> Yêu cầu **Node.js ≥ 22** (`node:sqlite` chỉ có từ Node 22.5+).

- DB file: `<repo>/data/fluentdev.db` (auto-created, gitignored — override with `DB_PATH`)
- Schema: `schema.sql` (`users` + `auth_sessions`, và các bảng data
  `sessions` + `messages`, `mistakes`, `vocab`, `tasks`, `progress_days` —
  đều có cột `user_id`)

```bash
npm run dev      # watch mode, :8241
npm start        # plain start
PORT=8241 DB_PATH=/tmp/x.db npm start
```

API: `GET /api/health`, CRUD under `/api/sessions`, `/api/mistakes`,
`/api/vocab`, `/api/tasks`, plus `GET /api/progress` and
`POST /api/progress/log`. The web app (`apps/web`) writes through to this
API when reachable and falls back to localStorage otherwise.

## Auth (đơn giản, local-first giữ nguyên)

Login = username + password (`node:crypto` scrypt), session = token ngẫu
nhiên 32 bytes trong httpOnly cookie `fd_session` (SameSite=Lax, 30 ngày);
DB chỉ lưu `sha256(token)`. Không email verify / OAuth / reset password.

- `POST /api/auth/register` — `{ username, password }` → tạo user + cookie
- `POST /api/auth/login` — `{ username, password }` → cookie session
- `POST /api/auth/logout` — xóa session hiện tại
- `GET  /api/auth/me` — `{ user }` (null khi anonymous)

**Local-first storage:** chưa đăng nhập thì các API vẫn hoạt động (scope
`user_id = ''` — anonymous). Web app hiện **yêu cầu đăng nhập** trước khi vào
UI chính (auth gate) — nhưng storage vẫn local-first: data lưu localStorage
trước, mirror SQLite qua server. Lần đầu đăng nhập/đăng ký, toàn bộ data ẩn
danh của browser được "adopt" vào account (`adoptAnonymous`) — merge một lần,
không mất dữ liệu. Sau đó mọi bảng được scoping theo `user_id`, mỗi user chỉ
thấy library của mình. DB cũ được migration tự động (thêm cột `user_id`,
rebuild unique constraints cho mistakes/vocab/progress_days).

## AI provider proxy

The server also proxies the web app's AI provider traffic so the API key
never has to live in the browser (web default: Connection mode = "Server
proxy"):

- `GET  /api/ai/status` — readiness probe (`{ ok, proxy, hasKey }`)
- `POST /api/ai/chat/completions` — JSON in, SSE/stream passthrough out
- `POST /api/ai/audio/transcriptions` — multipart audio → transcription JSON
- `POST /api/ai/audio/speech` — JSON in, audio stream out

Env vars:

| Var | Default | Ý nghĩa |
|-----|---------|---------|
| `AI_PROXY_BASE_URL` | `http://localhost:20128/v1` | OpenAI-compatible upstream |
| `AI_PROXY_API_KEY` | *(empty)* | Key gắn vào header `Authorization: Bearer …` khi forward upstream |
| `AI_PROXY_TOKEN` | *(empty)* | Optional: client phải gửi đúng Bearer token này khi POST /api/ai/* (hardening cho non-browser local callers; browser đã bị chặn bởi CORS allowlist) |

Actions are whitelisted — the client cannot pick an arbitrary upstream path.
```bash
AI_PROXY_BASE_URL=https://api.openai.com/v1 AI_PROXY_API_KEY=sk-... npm start
```
