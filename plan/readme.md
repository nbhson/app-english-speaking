# Plan — app-english-speaking

> FluentDev: luyện nói tiếng Anh (React/Vite web + Express/SQLite server local-first).

## Kết quả Review (audit đợt 1)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | MAJOR | server/index.js:24 | `cors()` trần + không auth: mọi website trong browser đọc/xóa/ghi SQLite library (sessions chứa full transcripts) qua `http://localhost:8241` | Allowlist origin (`localhost:8240`, override `LIBRARY_ORIGIN`), ngoài danh sách → không set CORS header |
| 2 | MAJOR | server/index.js:130 | `DELETE /api/sessions` xóa sạch toàn bộ library không cần confirm | Bắt buộc body `{"confirm":"DELETE ALL"}`; client mirror gửi confirm |
| 3 | MAJOR | server/index.js:287-290 | Error handler trả raw `err.message` (SQL shape, file paths) | Generic message, chi tiết chỉ vào log server (full stack) |
| 4 | MAJOR | web/App.tsx:609 | `setTimeout(() => stopSession(true), 1500)` không hủy — start session mới trong 1.5s sau Finish bị timer cũ force-stop | Session epoch + clear timer trong stopSession |
| 5 | MAJOR | web/App.tsx:544-605 | `finishAndAssess` ghi đè `abortRef` khi stream cũ đang chạy — stream cũ không hủy được, 2 stream cùng ghi transcript | Abort controller cũ trước khi bắt đầu assessment |
| 6 | MAJOR | web/LibraryPanel.tsx:219 | `s.avgScore.toFixed(1)` crash với row import thiếu/khác kiểu số | Guard `Number.isFinite` khi render + coerce mọi trường số lúc import (storage.ts) |
| 7 | MINOR | server:36 | `limit=-1` → SQLite LIMIT -1 (unbounded payload) | Clamp `>= 1` |
| 8 | MINOR | server:34 | `/api/health` lộ DB filesystem path | Chỉ trả `{ok:true}` |
| 9 | MINOR | server:110-121 | Client id/role không validate: id trùng rollback cả session | Server sinh id (uuid), whitelist role, cap 1000 message, bound text |
| 10 | MINOR | server:237 | progress log nhận xp/duration âm/huge → XP/streak poisoning | Clamp 0..10000 xp / 0..86400s |
| 11 | MINOR | server:20 | `uid()` = Math.random + timestamp: predictable, collision | `crypto.randomUUID()` |
| 12 | MINOR | server:280 | unhandledRejection chỉ log message, mất stack | Log full stack |
| 13 | MINOR | vite.config.ts:9 | Dev server bind 0.0.0.0 → expose app/HMR ra LAN | Mặc định localhost (override `DEV_HOST`) |
| 14 | MINOR | web/storage.ts:263 | `importLibrary` chỉ validate `s.id` — field số sai kiểu crash UI khi render | Coerce numeric fields khi import |

## Trạng thái

- [x] Plan
- [x] Fix #1–#14
- [x] `node --check` server OK; web `tsc --noEmit` pass; vitest 27/27 pass
- [x] Commit + self-review

## Review Log

### Vòng 1
- Self-review: `mirrorClearSessions` cập nhật gửi confirm body — khớp với guard mới của server; queue retry (`sendOp`) đã gửi body sẵn nên không cần đổi thêm. CORS: dùng `cb(null, false)` thay vì throw để header không được set (throw sẽ thành 500 sau middleware order). Timer Finish: epoch tăng ở cả start lẫn stop — kiểm tra luồng startSession → stopSession(false) (đổi mode) cũng tăng epoch, an toàn.
