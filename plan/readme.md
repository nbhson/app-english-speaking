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

# Round 2 — Enterprise upgrade đợt 2 (2026-10-29)

## Objective

Nâng một tầm nữa: rà soát kiến trúc + bug tiềm ẩn, siết error handling/security ở
cả web & server, đồng bộ design system, và bổ sung 4 feature thực dụng cho app
luyện nói (goal hàng tuần, onboarding, stats dashboard, persistence).

## Findings (audit đợt 2)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| R2-1 | MAJOR | web/storage.ts `todayKey`, server index.js progress | Ngày streak dùng UTC (`toISOString`) — user ở VN (UTC+7): buổi học 00:00–07:00 sáng được tính vào hôm trước, streak reset oan | Tính ngày theo giờ local ở cả client + server (`localDateKey`) |
| R2-2 | MAJOR | web/App.tsx | `startError` (lỗi STT/micro giữa buổi) chỉ render trong `StartScreen` — khi session đang active user không thấy lỗi nào | Banner lỗi inline dismissible trong session |
| R2-3 | MAJOR | server index.js:100 | `POST /api/sessions`: mode là chuỗi tùy ý không giới hạn độ dài; startedAt/durationSec/turns… không coerce → NaN binding làm SQLite throw 500 | Validate mode + `intOr` mọi trường số |
| R2-4 | MAJOR | server index.js | `POST /api/mistakes|/api/vocab` không giới hạn độ dài string (body 5MB → ghi cả vào SQLite) | Cap độ dài từng field |
| R2-5 | MINOR | web/App.tsx | 2 block `runChatStream` (turn + finish) trùng ~45 dòng handler code | Extract `streamTurn()` dùng chung |
| R2-6 | MINOR | web/utils/api.ts | 4× duplicated "res.ok check + errText.slice(0,300)" | Extract `assertOk()` helper |
| R2-7 | MINOR | web Header | Badge "Coach Online" hardcoded — luôn xanh dù gateway/server chết | Badge thật: ping `/api/health` của Library server |
| R2-8 | MINOR | web LibraryPanel history | Mode hiển thị raw enum ("daily") thay vì label đẹp | Chip mode từ MODE_CONFIGS |
| R2-9 | MINOR | UI | `inputCls`/`toggleCls`/button styles bị copy lặp ở SettingsModal, LibraryPanel… | Shared design tokens `utils/ui.ts` |

## Planned changes

1. **Bugs + hardening**: R2-1 → R2-4, R2-6, R2-8 (fix + test).
2. **Design system**: `utils/ui.ts` chứa class token chung (button/card/input/toggle), áp vào SettingsModal/LibraryPanel; focus-visible ring nhất quán.
3. **Header**: badge trạng thái Library server thật (poll health), bỏ "Coach Online" giả.
4. **Features**:
   - F1 Weekly goal — đặt mục tiêu phút/tuần trong Settings, progress ring trong tab Progress, persist localStorage.
   - F2 Onboarding tour lần đầu chạy app (3 bước, a11y, có nút xem lại trong Settings).
   - F3 Practice stats trong tab Progress: tổng 7 ngày (phút/sessions/XP), best streak, avg score, phân bố theo mode.
   - F4 Persist UI prefs: mode + scenario + custom topic + panel visibility giữ nguyên sau reload.
5. **Verify**: `npm test`, `npm run build`, `node --check` server. Self-review diff.

## Trạng thái Round 2

- [x] Plan
- [x] Fix R2-1..R2-9
- [x] F1 Weekly goal · F2 Onboarding · F3 Stats · F4 UI prefs
- [x] `npm test` 44/44 pass · `npm run build` OK · `node --check` server OK
- [x] Commit + self-review
