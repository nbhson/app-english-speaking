// Daily Challenge — một thử thách ngắn mỗi ngày, sinh deterministic theo ngày
// (cùng ngày = cùng thử thách trên mọi thiết bị, không cần server). Hoàn thành
// được ghi nhận vào localStorage; XP bonus cộng trực tiếp vào buổi luyện.

import { AppMode } from '../types';
import { todayKey } from './storage';

export interface DailyChallenge {
  date: string; // YYYY-MM-DD
  mode: AppMode;
  scenarioId: string;
  title: string;
  task: string; // yêu cầu cụ thể (tiếng Việt)
  minTurns: number; // số lượt nói tối thiểu để tính hoàn thành
  bonusXP: number;
}

interface DailyTemplate {
  mode: AppMode;
  scenarioId: string;
  title: string;
  task: string;
  minTurns: number;
}

const TEMPLATES: DailyTemplate[] = [
  { mode: AppMode.DAILY, scenarioId: 'weekend', title: 'Weekend trong 90 giây', task: 'Kể về cuối tuần vừa rồi bằng past tense — thêm 1 chi tiết bất ngờ và 1 idiom.', minTurns: 2 },
  { mode: AppMode.DAILY, scenarioId: 'food', title: 'Foodie story', task: 'Mô tả món ăn bạn thích nhất và tại sao — dùng ít nhất 3 tính từ miêu tả.', minTurns: 2 },
  { mode: AppMode.DAILY, scenarioId: 'travel', title: 'Travel flashback', task: 'Kể 1 kỷ niệm du lịch đáng nhớ theo dạng storytelling (bối cảnh → sự kiện → cảm xúc).', minTurns: 3 },
  { mode: AppMode.DAILY, scenarioId: 'tech-life', title: 'Tech rant', task: 'Chia sẻ 1 điều bạn yêu/ghét về công việc dev — trình bày ý kiến rõ ràng với 2 lý do.', minTurns: 2 },
  { mode: AppMode.DAILY, scenarioId: 'smalltalk-office', title: 'Elevator talk', task: 'Làm quen với đồng nghiệp trong thang máy — chào, 2 câu small-talk, rồi chốt lịch cà phê.', minTurns: 2 },
  { mode: AppMode.MEETING, scenarioId: 'standup', title: 'Standup siêu ngắn', task: 'Update standup trong 30 giây: Yesterday / Today / Blockers — không filler words.', minTurns: 2 },
  { mode: AppMode.MEETING, scenarioId: 'client', title: 'Xử lý khách khó', task: 'Client đòi rút ngắn deadline — đàm phán: đồng ý một phần, đề xuất phương án thay thế.', minTurns: 3 },
  { mode: AppMode.MEETING, scenarioId: 'planning', title: 'Defend the estimate', task: 'Bảo vệ con số estimate của bạn trước lead nghi ngờ — dùng dữ liệu và trade-offs.', minTurns: 3 },
  { mode: AppMode.MEETING, scenarioId: 'retro', title: 'Disagree politely', task: 'Không đồng ý với 1 điểm trong retro mà vẫn giữ hòa khí — dùng 2 cấu trúc soften (hedge).', minTurns: 2 },
  { mode: AppMode.PRESENTATION, scenarioId: 'deliver', title: 'Pitch 60 giây', task: 'Deliver 1 phút về project bạn đang làm: Hook → 2 điểm chính → Close, không đọc slide.', minTurns: 2 },
  { mode: AppMode.PRESENTATION, scenarioId: 'qa', title: 'Q&A lạnh gáy', task: 'Trả lời 3 câu hỏi khó liên tiếp về project — mỗi câu ngắn, tự tin, có số liệu.', minTurns: 3 },
  { mode: AppMode.PRESENTATION, scenarioId: 'outline', title: 'Outline trong 1 phút', task: 'Dựng outline thuyết trình: Hook → 3 points → Close cho chủ đề do coach đưa.', minTurns: 2 },
];

/** djb2-ish hash — đủ để chọn template theo ngày một cách ổn định. */
function hashDate(dateKey: string): number {
  let h = 5381;
  for (let i = 0; i < dateKey.length; i++) {
    h = ((h << 5) + h + dateKey.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const CHALLENGE_KEY = 'fluentdev-daily-challenge-v1';
export const DAILY_BONUS_XP = 50;

export function getDailyChallenge(date = new Date()): DailyChallenge {
  const dateKey = todayKey(date);
  const t = TEMPLATES[hashDate(dateKey) % TEMPLATES.length];
  return { date: dateKey, ...t, bonusXP: DAILY_BONUS_XP };
}

interface DailyRecord {
  date: string;
  completedAt: number;
  bonusXP: number;
}

function readRecord(): DailyRecord | null {
  try {
    const raw = localStorage.getItem(CHALLENGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyRecord;
    return parsed && typeof parsed.date === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function isDailyDone(date = new Date()): boolean {
  const rec = readRecord();
  return !!rec && rec.date === todayKey(date);
}

export function markDailyDone(date = new Date()): void {
  try {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify({ date: todayKey(date), completedAt: Date.now(), bonusXP: DAILY_BONUS_XP }));
  } catch {
    /* quota ignore */
  }
}
