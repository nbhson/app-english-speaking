# @fluentdev/library-api

Local-first storage backend for FluentDev's 📚 My Learning Library.
Express + SQLite via Node's built-in `node:sqlite` (no native deps, no auth).

- DB file: `<repo>/data/fluentdev.db` (auto-created, gitignored — override with `DB_PATH`)
- Schema: `schema.sql` (`sessions` + `messages`, `mistakes`, `vocab`, `progress_days`)

```bash
npm run dev      # watch mode, :3001
npm start        # plain start
PORT=3001 DB_PATH=/tmp/x.db npm start
```

API: `GET /api/health`, CRUD under `/api/sessions`, `/api/mistakes`,
`/api/vocab`, plus `GET /api/progress` and `POST /api/progress/log`.
The web app (`apps/web`) writes through to this API when reachable and
falls back to localStorage otherwise.
