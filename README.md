
# FluentDev — AI English Speaking Coach

> **AI English Speaking Coach** dành riêng cho software developers: luyện nói tiếng Anh tự nhiên trong giao tiếp hằng ngày, họp công việc và thuyết trình — trò chuyện **voice trực tiếp như 2 người** với AI Coach.

[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-purple)](https://vite.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-CDN-38bdf8)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)]()

---

## 📋 Mục lục

- [FluentDev — AI English Speaking Coach](#fluentdev--ai-english-speaking-coach)
  - [📋 Mục lục](#-mục-lục)
  - [✨ Tính năng](#-tính-năng)
  - [🧱 Công nghệ](#-công-nghệ)
  - [🏗️ Kiến trúc tổng quan](#️-kiến-trúc-tổng-quan)
  - [🚀 Cài đặt \& chạy](#-cài-đặt--chạy)
  - [⚙️ Cấu hình kết nối AI](#️-cấu-hình-kết-nối-ai)
    - [🧠 Chat Model (bộ não) — bắt buộc](#-chat-model-bộ-não--bắt-buộc)
    - [🎙️ Speech-to-Text (STT)](#️-speech-to-text-stt)
    - [🔊 Text-to-Speech (TTS)](#-text-to-speech-tts)
  - [🎯 Các chế độ luyện tập](#-các-chế-độ-luyện-tập)
  - [🔄 Luồng voice hoạt động](#-luồng-voice-hoạt-động)
    - [Chế độ voice (Daily / Meeting / Presentation / Custom)](#chế-độ-voice-daily--meeting--presentation--custom)
    - [Chế độ VN→EN Helper](#chế-độ-vnen-helper)
    - [Push-to-talk (khi STT = OmniRoute)](#push-to-talk-khi-stt--omniroute)
  - [📝 Định dạng output của model](#-định-dạng-output-của-model)
    - [`[Correction]` → Thẻ Correction](#correction--thẻ-correction)
    - [`[Assessment]` → Dashboard điểm số](#assessment--dashboard-điểm-số)
  - [📁 Cấu trúc thư mục](#-cấu-trúc-thư-mục)
    - [Các module chính](#các-module-chính)
  - [📜 Scripts](#-scripts)
  - [🔧 Troubleshooting](#-troubleshooting)
  - [🗺️ Roadmap](#️-roadmap)
  - [🙏 Ghi nhận](#-ghi-nhận)

---

## ✨ Tính năng

| Tính năng | Mô tả |
|---|---|
| 🎙️ **Voice conversation trực tiếp** | Nói chuyện với AI Coach như hai người: nghe → trả lời → đọc lại bằng giọng nói |
| 🧠 **AI model cấu hình được** | Base URL / API key / model chỉnh ngay trong app (Settings ⚙️), lưu vào `localStorage` |
| 🎯 **5 chế độ luyện tập** | Daily / Meeting / Presentation / Custom Topic / VN→EN Helper |
| 🛠️ **Real-time Correction** | Model phát hiện lỗi sai → hiện thẻ **Correction**: Original / Corrected / Better Alternative / Why |
| 💡 **Natural Phrasing** | Gợi ý cách diễn đạt tự nhiên hơn cho từng câu của bạn |
| 📊 **Assessment liên tục** | 9 kỹ năng + Vocab points + Confidence %, cập nhật real-time vào dashboard |
| 🧠 **Coach Insight (AI)** | Feedback cá nhân do AI viết (`[Insight]` block) hiển thị trong panel — tự suy từ điểm nếu model không xuất |
| 🔁 **Toggle Auto-listen** | ON: tự nghe liên tục. OFF: dừng sau mỗi lượt, bấm **Continue** để nói tiếp khi đã đọc suggestion |
| 🖱️ **Hover-to-translate** | Di chuột vào bất kỳ từ tiếng Anh nào → popup nghĩa tiếng Việt + IPA + ví dụ, có nút nghe phát âm |
| 🔍 **Select-phrase translate** | Bôi đen một cụm từ bất kỳ → dịch nghĩa tiếng Việt ngay tại chỗ |
| 🌐 **Dịch cả message** | Nút trên mỗi message để dịch toàn bộ sang tiếng Việt |
| 📜 **Auto-scroll chat** | Main content tự động cuộn xuống tin nhắn mới nhất khi có nội dung mới — kể cả khi AI đang stream từng chữ |
| 🎨 **Dark / Light mode** | Giao diện tối/sáng, nhớ lựa chọn của bạn. Dark theme dùng tông **đen/xám trung tính**, accent xanh dương chuẩn |
| ⏱️ **Session stats** | Thời lượng phiên, điểm từ vựng, mức độ tự tin |

---

## 🧱 Công nghệ

- **Frontend**: React 19 + TypeScript + Vite 6
- **Styling**: Tailwind CSS (qua CDN) + [Motion](https://motion.dev/) (Framer Motion) cho animation
- **Icons**: lucide-react
- **Voice**:
  - **STT** (Speech-to-Text): Web Speech API (browser) *hoặc* OmniRoute `/v1/audio/transcriptions`
  - **TTS** (Text-to-Speech): `speechSynthesis` (browser) *hoặc* OmniRoute `/v1/audio/speech`
- **AI**: OpenAI-compatible endpoint (mặc định là **OmniRoute** gateway cục bộ)

---

## 🏗️ Kiến trúc tổng quan

Ứng dụng được **migrate khỏi Gemini Live API** (WebSocket) sang kiến trúc **turn-based voice** (đơn giản, tương thích mọi gateway OpenAI-compatible):

```
 ┌──────────┐   STT (Web Speech / OmniRoute)   ┌─────────────────┐
 │  User    │ ───────────────────────────────▶ │  Transcript text │
 └──────────┘                                   └─────────────────┘
                                                          │
                                                          ▼
 ┌──────────┐   TTS (speechSynthesis / OmniRoute)  ┌────────────────────────────┐
 │ Speaker  │ ◀─────────────────────────────────── │  /v1/chat/completions (SSE) │
 └──────────┘        voice trả lời                 │  OmniRoute / any OpenAI-compat │
                                                   └────────────────────────────┘
```

**Nguyên tắc**: Model chat là "bộ não" — **bắt buộc cấu hình** (base URL + model). STT/TTS **mặc định chạy trên browser** (không cần key) và có thể chuyển qua OmniRoute khi có credentials.

---

## 🚀 Cài đặt & chạy

**Yêu cầu**: Node.js ≥ 18

```bash
# 1. Cài dependencies
npm install

# 2. Chạy dev server
npm run dev

# 3. Mở trình duyệt
#    http://localhost:3000
```

> ⚠️ **Bắt buộc**: Đảm bảo gateway AI đang chạy trước khi dùng. Với OmniRoute cục bộ:
>
> ```bash
> cd /Users/nguyenson/Github/OmniRoute
> npm run dev        # chạy tại http://localhost:20128
> ```

---

## ⚙️ Cấu hình kết nối AI

App hoạt động với **bất kỳ gateway AI nào hỗ trợ API OpenAI-compatible** (chat completions) — ví dụ: OmniRoute, OpenAI, OpenRouter, vLLM, LM Studio, Ollama (qua adapter)… Bấm icon **⚙️ Settings** (góc trên phải) để mở modal cấu hình. Mọi thay đổi được lưu vào `localStorage` (key `fluentdev-ai-config`) — chỉ cần lưu là áp dụng ngay.

> Giá trị mặc định trỏ vào **OmniRoute** cục bộ (`http://localhost:20128/v1`) chỉ là ví dụ — bạn hoàn toàn có thể trỏ sang provider khác.

### 🧠 Chat Model (bộ não) — bắt buộc

| Field | Giá trị mặc định | Ghi chú |
|---|---|---|
| **Base URL** | `http://localhost:20128/v1` | Endpoint OpenAI-compatible của gateway (VD: `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, ...) |
| **API Key** | *(trống)* | Local gateway thường không cần (VD: OmniRoute `REQUIRE_API_KEY=false`). Gateway remote thì bắt buộc (Bearer token) |
| **Model** | `gemini/gemini-3-flash-preview` | Bất kỳ model nào gateway expose. VD: `gpt-4o`, `claude-...`, `gemini/...`, `auto/best-chat`... |

### 🎙️ Speech-to-Text (STT)

| Engine | Mô tả |
|---|---|
| **Browser (Web Speech)** *(mặc định)* | Dùng microphone trình duyệt, nghe liên tục (`continuous: true`), tự động nhận diện khi bạn nói. Không cần key. |
| **Gateway** | Push-to-talk: giữ nút **"Hold to Speak"** để thu âm → gửi `/v1/audio/transcriptions` lên gateway. Cần gateway hỗ trợ endpoint này + credentials provider (VD: `deepgram/nova-3`, `assemblyai/best`) |

### 🔊 Text-to-Speech (TTS)

| Engine | Mô tả |
|---|---|
| **Browser** *(mặc định)* | `speechSynthesis` — phát âm trực tiếp, không cần key. Giọng phụ thuộc vào hệ điều hành/trình duyệt. |
| **Gateway** | Gửi `/v1/audio/speech` lên gateway → **Vertex Gemini TTS** cho giọng tự nhiên hơn hẳn. Chọn **model** (VD: `vertex/gemini-2.5-flash-preview-tts`) + **voice Gemini** (VD: `Zephyr`, `Puck`, `Kore`). Nút **Test voice** trong Settings để nghe thử trước khi lưu. |

> **Khuyến nghị giọng Gateway (Gemini TTS)**: Model mặc định là `vertex/gemini-2.5-flash-preview-tts`, voice `Zephyr` — app đã gợi ý sẵn trong dropdown Settings. Để dùng được, gateway phải có credentials Vertex và project GCP phải **bật các model TTS** trong Organization Policy:
> 1. Mở Google Cloud Console → **Organization Policies**.
> 2. Tìm ràng buộc `constraints/vertexai.allowedModels`.
> 3. Thêm `publishers/google/models/gemini-2.5-flash-preview-tts`, `.../gemini-2.5-pro-preview-tts`, `.../gemini-3.1-flash-tts-preview` vào danh sách allowed.
>
> Nếu chưa cấu hình được GCP, giữ engine **Browser** là vẫn dùng được ngay (không cần key).

---

## 🎯 Các chế độ luyện tập

| Chế độ | Icon | Mô tả |
|---|---|---|
| 🏠 **Daily Conversation** | `🏠` | Hội thoại giao tiếp hằng ngày |
| 💼 **Business Meeting** | `💼` | Họp công việc, bàn về kế hoạch kiến trúc |
| 📊 **Presentation Skills** | `📊` | Luyện thuyết trình / tech demo |
| 🎯 **Custom Topic** | `🎯` | Nhập chủ đề tự do (phỏng vấn, du lịch, order cafe...) |
| 🇻🇳 **VN to EN Helper** | `🇻🇳` | Gõ câu tiếng Việt → model gợi ý cách nói tiếng Anh tự nhiên (trả lời bằng tiếng Việt) |

---

## 🔄 Luồng voice hoạt động

### Chế độ voice (Daily / Meeting / Presentation / Custom)

1. Bấm **Start Speaking** → xin quyền microphone
2. Web Speech API **nghe liên tục**, mỗi câu hoàn chỉnh tự động gửi lên model
3. Model trả lời streaming (SSE) — hiện text real-time vào chat
4. Khi hoàn tất, **TTS đọc to câu trả lời** cho bạn nghe
5. AI Coach đọc xong → tiếp tục lắng nghe → **vòng lặp 2 người** tiếp tục

> **🔁 Auto-listen**: toggle ở thanh điều khiển. **ON** (mặc định) — tự nghe liên tục như trên. **OFF** — sau khi AI trả lời xong app dừng nghe, hiện nút **🎤 Continue**; bạn đọc kỹ suggestion/correction rồi bấm để nói tiếp.
>
> Khi phiên đang chạy chỉ có **1 nút hành động** duy nhất: **🏁 Finish & Assess** (chạy đánh giá cuối + kết thúc phiên).

### Chế độ VN→EN Helper

1. Gõ câu tiếng Việt vào ô nhập
2. Model trả về: gợi ý tiếng Anh tự nhiên + giải thích bằng tiếng Việt
3. Dùng nút **X** để dừng phiên (Stop Session)

### Push-to-talk (khi STT = OmniRoute)

Giữ nút **🎤 Hold to Speak** → nói → nhả nút → audio gửi lên OmniRoute dịch thành text → chảy vào cùng vòng lặp.

---

## 📝 Định dạng output của model

Model Coach output các **text block đặc biệt** mà app tự động parse (thay cho tool calls cũ):

> 💬 **Lượt trả lời dài**: Coach **không dừng ở sửa lỗi/suggest** — luôn mở rộng hội thoại thêm **2–3 câu dựa trên câu bạn vừa nói** (phản hồi nội dung → mở rộng cách diễn đạt → 1 câu hỏi tiếp nối) để cuộc trò chuyện tiếp tục tự nhiên. Chỉnh hành vi này trong `SYSTEM_INSTRUCTION` của `constants.ts`.

### `[Correction]` → Thẻ Correction

```
[Correction]
Original: I go to meeting yesterday.
Corrected: I went to the meeting yesterday.
Alternative: "I attended the meeting yesterday."
Explanation: Dùng quá khứ vì đã xảy ra hôm qua.
[/Correction]
```

Hiển thị thành card **Correction & Improvement** với các dòng `Original:` / `Corrected:` / `Alternative:` / `Explanation:`, kèm nút nghe phát âm bản thay thế.

### `[Assessment]` → Dashboard điểm số

```
[Assessment]
Fluency: 4
Listening: 3
Reflexing: 4
Sentence Flexibility: 3
Vocabulary Flexibility: 3
Intonation: 3
Linking: 2
Final Sound: 3
Stress: 3
Vocabulary Points: 5
Confidence: 70
[/Assessment]
```

App parse block này cập nhật 9 thanh kỹ năng + **Vocab pts** + **Confidence %**. Model được hướng dẫn **không đọc điểm to** trong lời nói.

### `[Insight]` → Coach Insight (AI viết)

Model có thể kèm 1 block feedback cá nhân (1-2 câu nói trực tiếp với học viên — điểm mạnh + 1 điều cần tập trung):

```
[Insight]
Your listening and quick reflexes are your strongest skills — nice work! The biggest win for you now is linking sounds between words so your sentences flow more naturally.
[/Insight]
```

App hiển thị block này vào ô **Coach Insight** trong panel đánh giá (không đọc to, không hiện trong chat). Nếu model không xuất `[Insight]`, app tự suy ra feedback từ điểm số (kỹ năng mạnh nhất / yếu nhất).

> `SYSTEM_INSTRUCTION` trong `constants.ts` định nghĩa format này. Muốn đổi tiêu chí đánh giá → chỉnh ở đó.

---

## 📁 Cấu trúc thư mục

```
ai-english-speaking-coach/
├── App.tsx                      # UI + orchestration phiên (turn-based voice)
├── constants.ts                 # System prompt của coach (correction + assessment format)
├── types.ts                     # TypeScript types + Web Speech API declarations
├── index.html                   # HTML entry (Tailwind CDN + tailwind.config darkMode class, CSS variables màu dark trong khối `.dark`, importmap React)
├── index.tsx                    # React root
├── package.json
├── tsconfig.json
├── vite.config.ts               # Vite config (port 3000, alias @)
├── metadata.json
└── components/
│   └── SettingsModal.tsx        # UI cấu hình kết nối AI (localStorage)
└── utils/
    └── api.ts                   # Config + OmniRoute client (chat/STT/TTS + translate)
```

### Các module chính

| File | Vai trò |
|---|---|
| `utils/api.ts` | `loadConfig`/`saveConfig` (localStorage), `chatStream` (SSE), `chatOnce`, `transcribe`, `speech`, `translateWord`, `translatePhrase` |
| `components/SettingsModal.tsx` | Modal cấu hình Base URL / API key / Model / STT / TTS, nút Reset defaults |
| `constants.ts` | `SYSTEM_INSTRUCTION` + `MODE_INFO` (mô tả 5 chế độ) |
| `App.tsx` | State & refs phiên, STT/TTS, xử lý `[Correction]`/`[Assessment]`, auto-scroll chat (`scrollRef`), HoverableWord, SelectionTranslator |

---

## 📜 Scripts

| Script | Mô tả |
|---|---|
| `npm run dev` | Chạy dev server (Vite) tại `http://localhost:3000` |
| `npm run build` | Build production ra `dist/` |
| `npm run preview` | Xem trước bản build |
| `npm run lint` | Kiểm tra type TypeScript (`tsc --noEmit`) |

---

## 🔧 Troubleshooting

| Vấn đề | Giải pháp |
|---|---|
| **"Chat failed (…)"** | Kiểm tra gateway AI đang chạy (`localhost:20128`), đúng Base URL và Model trong Settings |
| **Web Speech API không hỗ trợ** | Dùng Chrome/Edge, hoặc chuyển STT sang **Gateway** trong Settings |
| **Microphone bị từ chối** | Vào cài đặt trình duyệt → cho phép quyền microphone với `localhost` |
| **STT/TTS OmniRoute lỗi** | Chưa cấu hình credentials trong OmniRoute → thêm `DEEPGRAM_API_KEY` / `OPENAI_API_KEY`... hoặc quay về Browser engine |
| **Không nghe thấy giọng đọc** | Kiểm tra volume hệ thống; với engine Browser đảm bảo trình duyệt có tiếng; bấm 🔊 trên từ để kiểm tra |

---

## 🗺️ Roadmap

- [x] Config base URL / API key / model trong UI
- [x] Kết nối AI model qua OmniRoute gateway
- [x] Turn-based voice (STT → chat → TTS)
- [x] Comprehensive Assessment hiển thị qua đánh giá AI (Coach Insight)
- [x] Toggle Auto-listen / nút Continue thủ công
- [ ] Test đầy đủ luồng voice (mic) qua Web Speech API
- [ ] Cấu hình credentials OmniRoute cho STT/TTS providers
- [ ] Lưu lịch sử session
- [ ] Nhiều profile config cho nhiều provider

---

## 🙏 Ghi nhận

- React, Vite, Tailwind CSS, Motion, lucide-react
