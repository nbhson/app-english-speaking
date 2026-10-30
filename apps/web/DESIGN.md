# FluentDev — Design System

> Hướng design: **Minimalism (nền) + Flat Design (components) + Subtle Motion**.
> Tinh thần "calm premium": app là công cụ luyện tập — UI phải nhường sân khấu cho
> nội dung (giọng nói, feedback, metrics), decoration tối thiểu và có chủ đích.

---

## 1. Nguyên tắc cốt lõi

1. **Một accent duy nhất**: `blue-600` cho CTA / active / focus. Mọi CTA nổi, link,
   trạng thái active đều dùng blue — không accent cạnh tranh.
2. **Mode identity = dot + chip nhỏ**: 5 màu mode (emerald / blue / violet / amber /
   rose trong `modes.ts`) chỉ xuất hiện ở **dot 8px** và **tinted chip nhẹ**
   (`accent` class — bg tint `50`/`900/20`, không tô full-panel, không shadow).
   Teal chỉ dùng trong bảng Assessment (data identity, khỏi đổi).
3. **Depth bằng border, không shadow**: card = border `1px` slate-200/800, nền
   `bg-white dark:bg-slate-900`. Chỉ 2 exception được phép shadow (xem bảng dưới).
4. **White space là priority**: section dùng gap/heading whitespace để phân cấp,
   không thêm border/divider khi whitespace đã đủ.
5. **Typography là anchor**: Inter (UI) + JetBrains Mono (code & con số).
   Hierarchy bằng size/weight, không bằng màu hay border dày.
6. **Motion tối giản**: chỉ micro-transition (color, `active:scale-95`,
   `animate-in fade-in` ≤ 200ms) + 1 aurora animation chậm (26s+). Mọi animation
   phải hoạt động khi `prefers-reduced-motion` (xem `.aurora-hero` trong `index.css`).

## 2. Tokens

### Radius (hard rule — không dùng giá trị ngoài scale này)

| Element | Class | Ghi chú |
|---|---|---|
| Panel / hero / modal shell / mobile sheet | `rounded-xl` (12px) | sidebar, chat section, assessment, dialog |
| Button / badge / banner / card nhỏ / input | `rounded-lg` (8px) | default cho mọi interactive |
| Icon-button nhỏ trong input pill | `rounded-md` (6px) | send/stop trong ControlBar |
| Chip / pill / FAB / toggle | `rounded-full` | starters, badges, mic FAB, sheet handle |

> Chat bubble giữ `rounded-2xl` + một góc vuông (`rounded-tl-none`) — convention
> của chat bubble, được miễn khỏi scale.

### Shadow

- **Mặc định: không shadow** (border là đủ).
- Cho phép:
  - CTA chính: `shadow-md shadow-blue-600/25` (Start CTA, Finish, Continue).
  - Floating/popover glass: `shadow-2xl` (SelectionTranslator, HoverableWord, Toast, modal scrim).
- Cấm: `shadow-lg`/`xl` trang trí trên card, logo, item — đã dọn hết.

### Color

- Structure: slate (50→950, đã token hóa RGB trong `index.css`).
- Accent duy nhất: `blue-600` / dark `blue-400` cho text.
- Mode colors: **chỉ** qua `mc.dot` (dot 2px) và `mc.accent` (tinted chip).
- Status: green = success/online, amber = warning/due, red = error — như cũ.
- Gamification (streak 🔥, XP ⚡): hiển thị dạng **số `font-mono tabular-nums`
  trong stat card nhỏ**, không sticker/toast lớn.

### Typography

- UI: **Inter** — hierarchy bằng size/weight (đang dùng, giữ nguyên).
- Mono: **JetBrains Mono** (`font-mono`) — bắt buộc cho:
  - inline code / code block (đã có trong `MessageMarkdown`),
  - **metric numerals** (WPM, XP, streak, duration…) kèm `tabular-nums`.

## 3. Surface đặc biệt

| Surface | Treatment | Vị trí |
|---|---|---|
| **Aurora hero** (`.aurora-hero`) | Gradient 2 blob blue/violet, blur 72px, opacity 0.3 (dark 0.45), drift 26–34s | **Chỉ Start Screen**. Không nơi nào khác được dùng gradient |
| **Glass sheet** | `dark:bg-slate-900/85 dark:backdrop-blur-xl` | Mobile assessment bottom sheet (dark mode duy nhất) |
| Glass popover | `backdrop-blur-md` + bg `/95` | SelectionTranslator, HoverableWord (có sẵn, giữ) |
| Tinted chip (mode accent) | bg `*-50` + border `*-200` + text `*-700` | intro, tip, focus rubric — surface nhỏ duy nhất có màu mode |

## 4. Checklist khi thêm UI mới

- [ ] Radius đúng scale trên? (không `rounded-2xl`/`3xl` cho panel/button)
- [ ] Card mới có border mà **không** shadow?
- [ ] Màu mới có phải blue-600 / slate / status color không? Mode color chỉ ở dot/chip?
- [ ] Interactive có feedback state? (hover:bg + active:scale-95, không scale hover lớn)
- [ ] Số liệu dùng `font-mono tabular-nums`?
- [ ] Animation có hoạt động ở `prefers-reduced-motion`?
- [ ] Icon: lucide line-icon, size 14–20, stroke mặc định — không icon fill to.

## 5. Anti-patterns (cấm)

- ❌ Rainbow: tô full-panel bằng mode color, thêm accent thứ 2 cạnh blue-600.
- ❌ Shadow + border cùng lúc trên card (chọn border).
- ❌ Gradient/blur ngoài 3 surface ở bảng trên.
- ❌ `hover:scale-105` trên CTA lớn (dùng `active:scale-[0.98]`).
- ❌ Badge/sticker gamification to màu mè — luôn dạng stat nhỏ, số mono.
- ❌ Radius hỗn độn (mỗi element một góc) — tuân thủ bảng radius ở trên.

## 6. Migration status

- ✅ Đã chuẩn hóa: Header, App shell (3 panel, banners, toolbar, mobile sheet),
  Sidebar, StartScreen (aurora), ControlBar, AssessmentPanel (mono numerals),
  CorrectionCard, Toast, ErrorBoundary, ProgressTab, SelectionTranslator,
  HoverableWord, SettingsModal, Onboarding, LibraryPanel,
  GuidedTour (driver.js popover theme `.fd-tour-popover`).
- ⏳ Còn giữ nguyên (chấp nhận có chủ đích): chat bubble `rounded-2xl`
  (`ChatMessageList`), pill chips `rounded-full`, SRS tabs chi tiết trong
  LibraryPanel nếu thêm mới hãy theo checklist.
