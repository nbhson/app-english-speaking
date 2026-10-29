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

# Round 2 (tiếp) — Rescue WIP + review bổ sung (2026-10-29)

## Bối cảnh

Session trước bị ngắt giữa chừng khi làm F2: `Onboarding.tsx` đã tạo nhưng chưa được
render, App.tsx import dở (WIP uncommitted). Đợt này review lại toàn bộ, hoàn tất
F2 và nâng thêm một tầng nữa.

## Objective

Hoàn tất F2 (onboarding), vá bug + hardening phát hiện thêm trong review đợt 2b,
thêm 2 feature (F5 session transcript viewer, F6 SRS due badge), verify đầy đủ.

## Findings (đợt 2b)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| R2b-1 | MAJOR | web/App.tsx + Onboarding.tsx (WIP) | Tour onboarding import + state nhưng KHÔNG render; không có replay từ Settings | Render `<Onboarding>`, prop `onReplayTour` vào SettingsModal → Advanced |
| R2b-2 | MINOR | server PATCH /api/mistakes/:id | `reviewCount` nhận số bất kỳ (âm/huge) → poison lịch SRS | Clamp 0..10000, chỉ cộng khi `reviewed === true` |
| R2b-3 | MINOR | web/ProgressTab.tsx | `commitGoal(Number(goalDraft))` → NaN khi input rỗng → ring render "NaN%" | Parse + clamp 30..3000, fallback goal hiện tại; commit cả khi blur |
| R2b-4 | MINOR | web/App.tsx `handleToggleTranslation` | Dịch thất bại trả `null` → UI im lặng, user tưởng bấm hỏng | Announce (aria-live) thông báo lỗi dịch |

## Features mới (đợt 2b)

- **F5 — Session transcript viewer**: row History trong Library bấm để bung transcript
  đầy đủ (bubble You/Coach, 💡 suggestion, scroll trong), không cần download .md.
- **F6 — SRS due badge**: icon 📚 trên Header hiện badge số thẻ mistakes/vocab đến hạn
  ôn (`countDueReviews()`); refresh khi Library đóng (prop `refreshSignal`) và khi mở app.

## Trạng thái Round 2 (tiếp)

- [x] Rescue + commit WIP F2 (`6f12654`)
- [x] Fix R2b-2..R2b-4
- [x] F5 transcript viewer (`f175323`) · F6 due badge (`4a8c6c7`)
- [x] `tsc --noEmit` pass · vitest 41/41 pass (thêm test weekly-goal clamp + countDueReviews) · `vite build` OK · `node --check` server OK
- [x] Commit + self-review diff cuối

## Remaining risks (đọc tiếp ở đợt sau)

- Bundle > 500 kB (vite warning) — cân nhắc code-split `motion`/`react-markdown` nếu cần.
- API key vẫn plaintext trong localStorage (đã cảnh báo trong Settings); giải pháp triệt để là proxy server-side.
- Server không có rate-limit — chấp nhận được vì local-first + CORS allowlist.

# Round 3 — Bundle optimization / code-splitting (2026-10-29)

## Objective

Xử lý recorded follow-up: "Bundle > 500 kB (vite warning) — candidates for
code-splitting: motion, react-markdown". Phân tích composition, tách async chunks,
không layout flash, không regress 41 tests.

## Phân tích bundle (before)

Build đơn chunk **657.60 kB** (gzip 204.19 kB). Attribution qua sourcemap
(unminified source trong initial graph):

| Dep | Source | Ghi chú |
|-----|--------|---------|
| react-dom | 533 kB | không tách được (React 19) |
| motion-dom + framer-motion | ~440 kB | full `motion` component = domMax (projection + drag) |
| react-markdown ecosystem (micromark/mdast/unified/vfile) | ~350 kB | chỉ dùng trong ChatMessageList |
| [app code] | 275 kB | |

Không có usage `layout`/`drag`/`whileHover`/`whileTap` → dùng được LazyMotion
`domAnimation` (chỉ animations + gestures), bỏ cả layout-projection engine.

## Changes (`c860876`)

1. **react-markdown → async chunk** (167.06 kB / gzip 51.17): `ChatMessageList`
   dùng `React.lazy(() => import('./MessageMarkdown'))` + preload ngay lúc
   module-eval (`void import(...)`) — message đầu tiên gần như luôn sẵn trước
   khi stream trả về. Fallback Suspense = plain text cùng wrapper class
   (`.msg-user`/`.msg-coach`) → không layout flash. Module `MessageMarkdown.tsx`
   giữ nguyên (export static) nên test import trực tiếp vẫn pass.
2. **motion → LazyMotion strict + `m` + domAnimation async**: mọi `motion.*`
   → `m.*` (App, ChatMessageList, AssessmentPanel, SkillRadar,
   SelectionTranslator). Features bundle tách file `utils/motionFeatures.ts`
   thành async chunk 35.94 kB (gzip 13.62), preload lúc app boot. `strict` =
   dev throw nếu ai import `motion` full trở lại. motion-dom trong initial
   graph: 324 kB → 102 kB (unminified).
3. **LibraryPanel (27.60) / SettingsModal (17.34) → async chunks**: 2 modal
   chỉ mở theo user action, `Suspense fallback={null}`.

## Kết quả bundle

| | Before | After |
|---|---|---|
| Initial chunk | 657.60 kB (gzip 204.19) | **366.87 kB** (gzip 117.28) |
| Async chunks | 0 | MessageMarkdown 167.06 · motionFeatures 35.94 · LibraryPanel 27.60 · SettingsModal 17.34 |
| Vite >500 kB warning | Có | **Không còn** |

Initial chunk −44% (minified), −43% gzip. Tổng bytes tải lần đầu gần như tương
đương (chunk markdown/motion-features/modals fetch song song, non-blocking) —
mục tiêu chính là giảm parse/eval trên critical path + hết warning.

## Verify

- [x] `tsc --noEmit` pass
- [x] vitest **41/41** pass (MessageMarkdown test import trực tiếp module → không bị ảnh hưởng bởi lazy wrapper)
- [x] `vite build` — không còn chunk warning; preview smoke-test OK
- [x] `eslint` changed files — 0 errors/warnings · `node --check` server OK

# Round 4 — Server-side AI proxy (2026-10-29)

## Objective

Fix the remaining round-3 risk: "API key stays plaintext in localStorage".
Add a server-side proxy so the key lives in the server env and the web app
defaults to proxy mode. Existing BYOK users get a one-time migration notice
and switch explicitly; no silent breakage.

## Findings

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|---------|-----|
| R4-1 | MAJOR | web localStorage / server env | API key lưu plaintext trong localStorage — bất kỳ XSS nào đọc được key của user, đặc biệt nguy hiểm khi user dùng remote gateway (OpenAI/Claude API key thật) | Server proxy: POST /api/ai/* forward upstream với key từ server env, browser chỉ gửi request body |
| R4-2 | MAJOR | web/api.ts | BYOK là default path (key trong localStorage) — user mới cũng phải lưu key ở browser | Proxy mode là default (`useServerProxy: true`); BYOK chỉ là explicit opt-in |
| R4-3 | MAJOR | web | Legacy user đang dùng BYOK: nếu app chuyển silent sang proxy, request không hoạt động nếu server chưa có env key | Migration notice: phát hiện key trong localStorage → banner one-time offer proxy; user chủ động chọn |

## Planned changes

1. **Server proxy** (`apps/server/src/index.js`):
   - `POST /api/ai/chat/completions` — JSON body, SSE passthrough (Readable.fromWeb)
   - `POST /api/ai/audio/transcriptions` — multipart passthrough
   - `POST /api/ai/audio/speech` — JSON → audio stream passthrough
   - `GET  /api/ai/status` — readiness `{ok, proxy, hasKey}`
   - Whitelist actions only (regex route — no path injection)
   - `AI_PROXY_BASE_URL`, `AI_PROXY_API_KEY`, `AI_PROXY_TOKEN` env vars
   - Optional Bearer token auth for non-browser callers
   - Client-disconnect → upstream abort (res.on('close') guard)
   - No upstream URL/key in error messages (only server log)

2. **Web client** (`apps/web/utils/api.ts`):
   - `AIConfig.useServerProxy` (default `true`)
   - `providerUrl(config, path)` → `{LIBRARY_API}/api/ai/<path>` or `{baseUrl}/<path>`
   - `buildHeaders()`: no Authorization header in proxy mode
   - `loadConfig()`: legacy key → direct BYOK (no silent switch); keyless → proxy
   - `saveConfig()`: strip key from localStorage when proxy mode
   - `proxyStatus()` helper for Settings UI

3. **Settings UI** — honest connection-mode UI:
   - "Server proxy (recommended)" / "Direct (BYOK)" toggle
   - Live proxy status (ping `/api/ai/status`) — online/offline/key indicator
   - Key input: disabled + server-side label in proxy mode; active in direct mode
   - Conditional Advanced note (proxy = green, direct = amber warning)

4. **Migration notice** (App.tsx):
   - Lazy state: legacy key in localStorage + no `fluentdev-proxy-notice` flag → banner
   - "Chuyển" → save proxy mode + write flag; "Keep direct" → write flag only
   - Key stays in named profiles (so switching back doesn't lose it)

5. **Verify**: tsc, vitest 49/49, vite build, node --check, curl smoke test

## Trạng thái Round 4

- [x] Plan
- [x] Fix R4-1..R4-3
- [x] Server proxy routes (`chat/completions`, `audio/transcriptions`, `audio/speech`) + status probe
- [x] Web proxy/direct routing with migration
- [x] Settings UI honest about mode + live status
- [x] Migration notice for legacy BYOK users
- [x] 8 new tests (proxyMode.test.ts: migration, key-stripping, URL routing, no-auth in proxy)
- [x] `tsc --noEmit` pass · vitest **49/49** pass · `vite build` OK · `node --check` server OK · eslint 0 errors
- [x] Commit + self-review

## Remaining risks

- `motionFeatures.ts` must keep export from `motion/react` (not hardcoded dist) — if package changes, keep this file separate for chunk splitting.
- Server doesn't have rate limiting — acceptable for local-first + CORS allowlist.
- Direct BYOK mode still stores the key in localStorage (intentional opt-in; honest UI + warning in place). No silent fallback to proxy if upstream is unreachable.
- If the Library server is down, proxy mode fails with "upstream unreachable" (HTTP 502). User must switch to Direct BYOK or bring the server up.
- Proxy migration notice fires only on first render (lazy initializer); if user dismisses it without acting, they stay on direct mode with key in browser — acceptable as explicit opt-in.
