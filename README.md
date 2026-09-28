
# FluentDev — monorepo

AI English Speaking Coach cho developers: luyện nói (Daily / Meeting / Presentation /
Custom Class / VN→EN) qua voice turn-based với AI Coach.

```
.
├── apps/
│   ├── web/        # React + Vite frontend (chat, coach, assessment, library UI)
│   └── server/     # Express + SQLite API cho 📚 My Learning Library (no auth, local-first)
├── data/           # fluentdev.db — SQLite 1 file (gitignored, tự tạo khi chạy server)
└── package.json    # workspaces + scripts chung
```

## Chạy dev (2 terminal hoặc 1 lệnh)

```bash
npm install          # cài root + workspaces
npm run dev          # server :8241 + web :8240 cùng lúc
```

Mở `http://localhost:8240`. Server Library tạo `data/fluentdev.db` ở lần chạy đầu.

- Chỉ chạy web: `npm run dev:web` (Library dùng localStorage)
- Chỉ chạy server: `npm run dev:server`
- Build web: `npm run build` · Test: `npm run test`

## Lưu trữ Library ở đâu?

`apps/web` ghi **write-through**: localStorage trước (UI tức thì), rồi mirror sang
SQLite qua `apps/server` nếu server đang chạy. Mở Library sẽ thấy badge
`● SQLite` (xanh) hoặc `● Local` (xám). Lần đầu kết nối, dữ liệu local cũ được
migrate 1 lần vào DB rỗng. Backup = copy file `data/fluentdev.db`.

Chi tiết từng app xem `apps/web/README.md` và `apps/server/README.md`.
