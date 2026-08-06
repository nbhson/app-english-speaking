# Engineering Report

## Summary of Changes

Mở rộng hành vi trả lời của AI Coach: sau mỗi lượt user nói, coach **không dừng ở sửa lỗi/suggest** mà tiếp tục kéo dài hội thoại **2–3 câu dựa trên câu user vừa nói** (react → mở rộng cách diễn đạt → 1 câu hỏi tiếp nối). Thay đổi nằm ở `SYSTEM_INSTRUCTION` trong `constants.ts` — app không cần đổi logic (vẫn parse các block `[Correction]`/`[Assessment]`/`[Insight]`, TTS đọc phần text ngoài block).

## Files Modified

- `constants.ts` — thêm section `ALWAYS EXTEND THE DIALOGUE` vào `SYSTEM_INSTRUCTION` (dòng 62–72): yêu cầu lượt nói luôn ≥ 2–3 câu, cấu trúc react → expand → 1 câu hỏi tiếp nối, kèm ví dụ; scope riêng mode `/translate` giữ trả lời ngắn gọn.
- `README.md` — bổ sung ghi chú "💬 Lượt trả lời dài" trong mục "Định dạng output của model".

## Verification & Validation Results

- **Automated Tests**: Không có test infra trong dự án (chỉ `lint`). Không có test mới.
- **Compilation Check**: `npm run lint` (`tsc --noEmit`) → **pass (exit 0)**.
- **Manual Check**: Gọi trực tiếp `/v1/chat/completions` trên OmniRoute gateway (localhost:20128, model `gemini/gemini-3-flash-preview`) với `SYSTEM_INSTRUCTION` mới:
  - **Mode daily** (câu user: *"Yesterday I go to the meeting..."*): phần nói ngoài block gồm 3 câu — react (*"It sounds like a productive day..."*) → mở rộng (*"In a professional setting, we often use the word 'sync' or 'alignment'..."*) → câu hỏi tiếp nối (*"How did the team react to the new plan — was everyone on board with the timeline?"*). ✅
  - **Mode translate** (câu VN): trả lời giữ gọn, tập trung gợi ý EN + giải thích VN + 1 câu hỏi phụ trợ nhẹ, không lan man. ✅

## Acceptance Criteria Traceability

| # | AC | Status | Evidence |
|---|----|--------|----------|
| 1 | Coach kéo dài lượt trả lời ≥ 2–3 câu dựa trên câu user nói (không chỉ sửa/suggest) | ✅ Met | `constants.ts:62-72`; API test daily mode → 3 câu + câu hỏi tiếp nối |
| 2 | Giữ nguyên format `[Correction]`/`[Assessment]`/`[Insight]` để app parse không đổi | ✅ Met | `constants.ts` block format không thay đổi; lint pass |
| 3 | Giữ quy tắc coach không tự viết câu student, dừng sau câu hỏi | ✅ Met | `constants.ts:72-74`; prompt vẫn giữ câu "STOP and WAIT" |
| 4 | Mode `/translate` không bị kéo dài lan man | ✅ Met | `constants.ts:72` scope translate; API test translate mode ngắn gọn |

## MCP Status

- **Jira**: Manual fallback — không có ticket (yêu cầu trực tiếp từ developer).
- **Figma**: Manual fallback — không có thiết kế mới.
- **Git Platform**: Manual fallback — chưa tạo branch/PR (thay đổi nhỏ, chưa commit).

## Risks & Mitigation

- **Rủi ro model lệch format**: model có thể để `[Correction]` chèn giữa câu nói hoặc tự viết thêm lượt student. Prompt đã nhấn mạnh "react and extend, then STOP" + quy tắc cũ "STOP and WAIT". Nếu thấy hành vi xấu khi dùng thật (mic), cần siết lại ví dụ mẫu hoặc tách hướng dẫn theo mode.
- **Translate mode dài hơn kỳ vọng nhẹ**: model vẫn thêm 1 câu hỏi phụ — chấp nhận được, không lan man.

## Pull Request

- Chưa tạo (chưa có yêu cầu commit/PR).
