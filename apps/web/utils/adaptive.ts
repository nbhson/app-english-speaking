// F11 — Adaptive difficulty: gợi ý tăng/giảm difficulty dựa trên điểm trung bình
// của 3 session gần nhất (chỉ session có điểm). Không tự đổi — luôn hỏi user.

import type { SessionRecord } from '../types';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

/** Ngưỡng: avg ≥ 4.4/5 trong 3 buổi liên tiếp → đủ mạnh để tăng level;
 *  avg ≤ 2.2 → đang quá sức, nên hạ để giữ động lực. */
const UPGRADE_THRESHOLD = 4.4;
const DOWNGRADE_THRESHOLD = 2.2;
const WINDOW = 3;

export function suggestDifficulty(sessions: SessionRecord[], current: Difficulty): Difficulty | null {
  const scored = [...sessions]
    .sort((a, b) => b.startedAt - a.startedAt)
    .filter((s) => Number.isFinite(Number(s.avgScore)) && Number(s.avgScore) > 0)
    .slice(0, WINDOW);
  if (scored.length < WINDOW) return null;
  const mean = scored.reduce((sum, s) => sum + Number(s.avgScore), 0) / scored.length;
  if (mean >= UPGRADE_THRESHOLD && current !== 'advanced') {
    return current === 'beginner' ? 'intermediate' : 'advanced';
  }
  if (mean <= DOWNGRADE_THRESHOLD && current !== 'beginner') {
    return current === 'advanced' ? 'intermediate' : 'beginner';
  }
  return null;
}

const DISMISS_KEY = 'fluentdev-adaptive-dismissed-v1';

/** Gợi ý đã bị user bỏ qua (lưu 1 giá trị — gợi ý mới khác sẽ hiện lại). */
export function getDismissedSuggestion(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setDismissedSuggestion(value: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, value);
  } catch {
    /* quota ignore */
  }
}
