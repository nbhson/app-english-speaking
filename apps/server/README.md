# @fluentdev/library-api

Local-first storage backend for FluentDev's 📚 My Learning Library.
Express + SQLite via Node's built-in `node:sqlite` (no native deps, no auth).

> Yêu cầu **Node.js ≥ 22** (`node:sqlite` chỉ có từ Node 22.5+).

- DB file: `<repo>/data/fluentdev.db` (auto-created, gitignored — override with `DB_PATH`)
- Schema: `schema.sql` (`sessions` + `messages`, `mistakes`, `vocab`, `progress_days`)

```bash
npm run dev      # watch mode, :8241
npm start        # plain start
PORT=8241 DB_PATH=/tmp/x.db npm start
```

API: `GET /api/health`, CRUD under `/api/sessions`, `/api/mistakes`,
`/api/vocab`, plus `GET /api/progress` and `POST /api/progress/log`.
The web app (`apps/web`) writes through to this API when reachable and
falls back to localStorage otherwise.

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
