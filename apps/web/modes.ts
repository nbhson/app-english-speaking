import { AppMode } from './types';

export interface ModeScenario {
  id: string;
  label: string;
  icon: string;
  setup: string;
}

export interface ModeConfig {
  mode: AppMode;
  title: string;
  tagline: string;
  description: string;
  /** tailwind accent classes for badges/cards */
  accent: string;
  dot: string;
  coachRole: string;
  skills: string[];
  starters: string[];
  scenarios?: ModeScenario[];
  phraseBank?: string[];
  rubric: string;
  tip: string;
}

export const MODE_CONFIGS: Record<AppMode, ModeConfig> = {
  [AppMode.DAILY]: {
    mode: AppMode.DAILY,
    title: 'Daily Conversation',
    tagline: 'Nói tự nhiên mỗi ngày',
    description: 'Luyện small-talk và phản xạ đời thường. Mỗi buổi 1 idiom + drill dùng ngay.',
    accent: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    coachRole: 'Conversation partner',
    skills: ['Fluency', 'Naturalness', 'Reflex'],
    starters: ['Weekend của bạn thế nào?', 'Kể về món ăn bạn thích', 'Kế hoạch du lịch sắp tới'],
    scenarios: [
      { id: 'weekend', label: 'Weekend', icon: '☀️', setup: 'Casual weekend small-talk. Ask about plans, hobbies, rest.' },
      { id: 'food', label: 'Food & Cafe', icon: '☕', setup: 'Talk about food, coffee, restaurants. Teach 1 food idiom.' },
      { id: 'travel', label: 'Travel', icon: '✈️', setup: 'Travel plans and experiences. Practice past tense + storytelling.' },
      { id: 'tech-life', label: 'Tech life', icon: '💻', setup: 'Daily dev life: coding, remote work, work-life balance.' },
      { id: 'smalltalk-office', label: 'Office small-talk', icon: '👋', setup: 'Office elevator talk: weather, lunch, weekend. Keep it light and short.' },
    ],
    phraseBank: [
      "By the way, ...",
      "That reminds me of ...",
      "Speaking of which, ...",
      "I’m really into ... lately",
    ],
    rubric: 'Chấm fluency + naturalness. Mỗi turn gợi 1 alternative tự nhiên hơn nếu câu đúng nhưng textbook.',
    tip: 'Đừng trả lời 1 câu cụt — thêm 1 chi tiết + 1 câu hỏi ngược.',
  },
  [AppMode.MEETING]: {
    mode: AppMode.MEETING,
    title: 'Business Meeting',
    tagline: 'Họp chuyên nghiệp, concise',
    description: 'Mô phỏng họp thật: standup, planning, retro, client. Có agenda + action items cuối buổi.',
    accent: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-600',
    coachRole: 'Colleague / Client',
    skills: ['Conciseness', 'Professionalism', 'Clarity'],
    starters: ['Give your standup update', 'Defend your estimate', 'Handle a disagreement'],
    scenarios: [
      { id: 'standup', label: 'Daily Standup', icon: '⚡', setup: 'Yesterday / Today / Blockers. Keep each update under 30 seconds. Push for concise updates.' },
      { id: 'planning', label: 'Sprint Planning', icon: '📋', setup: 'Discuss scope, estimate, trade-offs. Challenge vague estimates, ask for clarification.' },
      { id: 'retro', label: 'Retro', icon: '🔄', setup: 'What went well / what to improve. Practice diplomatic disagreement.' },
      { id: 'client', label: 'Client Call', icon: '🤝', setup: 'You are a picky client. Ask tough questions about timeline, quality, cost. Student must stay calm and professional.' },
    ],
    phraseBank: [
      'Let me pick up on that point ...',
      'To circle back on ...',
      'If I may add ...',
      'Let’s take this offline ...',
      'To summarise, action items are ...',
    ],
    rubric: 'Chấm conciseness + professionalism. Câu dài dòng → gợi version ngắn hơn. Cuối buổi tóm tắt action items.',
    tip: 'Trả lời theo STAR ngắn: kết quả → lý do → đề xuất.',
  },
  [AppMode.PRESENTATION]: {
    mode: AppMode.PRESENTATION,
    title: 'Presentation Skills',
    tagline: 'Nói có structure, Q&A tự tin',
    description: 'Luyện outline → deliver 1-2 phút → trả lời câu hỏi khó. Chấm pace, filler, signposting.',
    accent: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/40 text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-600',
    coachRole: 'Audience + Slide coach',
    skills: ['Structure', 'Pace', 'Q&A'],
    starters: ['Present your project in 1 minute', 'Explain a technical decision', 'Pitch a new idea'],
    scenarios: [
      { id: 'outline', label: 'Outline', icon: '📝', setup: 'STAGE OUTLINE: help student build Hook → 3 points → Close. Give feedback on structure only, then ask to deliver.' },
      { id: 'deliver', label: 'Deliver 1-2 min', icon: '🎤', setup: 'STAGE DELIVER: student speaks 1-2 minutes uninterrupted. Listen, then give structure + pace + filler feedback.' },
      { id: 'qa', label: 'Tough Q&A', icon: '❓', setup: 'STAGE Q&A: ask ONE tough follow-up question per turn (why, trade-off, numbers). Push for short confident answers.' },
    ],
    phraseBank: [
      'To kick off, ...',
      'Moving on to my next point ...',
      'To wrap up, ...',
      'Great question — the short answer is ...',
    ],
    rubric: 'Chấm structure + signposting + pace. WPM lý tưởng 130-160. Filler >3/turn → nhắc cụ thể.',
    tip: 'Mỗi phần bắt đầu bằng signpost: First / Next / Finally.',
  },
  [AppMode.CUSTOM]: {
    mode: AppMode.CUSTOM,
    title: 'Custom Class',
    tagline: 'Lớp học 1-1 với AI giáo viên',
    description: 'Nhập 1 chủ điểm → AI giảng, cho ví dụ, ra drill, sửa chi tiết. Cuối buổi có quiz 3 câu.',
    accent: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    coachRole: 'Teacher',
    skills: ['Grammar', 'Drills', 'Mastery'],
    starters: ['used to vs be used to', 'present perfect', 'conditionals type 2'],
    scenarios: [
      { id: 'understand', label: 'Hiểu rõ', icon: '💡', setup: 'GOAL: hiểu sâu bản chất + phân biệt dễ nhầm. Giải thích kỹ, nhiều ví dụ đối chiếu.' },
      { id: 'use', label: 'Dùng được', icon: '✍️', setup: 'GOAL: dùng được ngay. Ít lý thuyết, nhiều drill đặt câu + sửa.' },
      { id: 'exam', label: 'Ôn thi/Quiz', icon: '📝', setup: 'GOAL: ôn thi. Ra quiz trắc nghiệm + điền từ, chấm điểm sau mỗi câu.' },
    ],
    phraseBank: [
      'Give me one more example using ...',
      'Quiz me on ...',
      'What’s the difference between ...?',
    ],
    rubric: 'Dạy 1 micro-point/turn: công thức → 2 ví dụ → 1 drill. Sửa chi tiết + lỗi hay gặp của người Việt. Cuối buổi quiz 3 câu.',
    tip: 'Chủ điểm càng hẹp càng tốt: "present perfect với already/just" > "thì hiện tại".',
  },
  [AppMode.TRANSLATE]: {
    mode: AppMode.TRANSLATE,
    title: 'VN → EN Helper',
    tagline: 'Dịch theo context, tự nhiên',
    description: 'Nhập tiếng Việt → nhận 2-3 options theo casual/business/formal + sắc thái. 1-tap lưu vocab.',
    accent: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
    coachRole: 'Translator',
    skills: ['Phrasing', 'Nuance', 'Vocab'],
    starters: ['Em muốn xin nghỉ phép thứ 6', 'Deadline này hơi căng', 'Cảm ơn anh đã feedback'],
    scenarios: [
      { id: 'casual', label: 'Casual', icon: '💬', setup: 'CONTEXT CASUAL: dịch tự nhiên như chat với bạn bè/đồng nghiệp thân. Ngắn gọn.' },
      { id: 'business', label: 'Business', icon: '💼', setup: 'CONTEXT BUSINESS: dịch lịch sự, professional, dùng trong meeting/email nội bộ.' },
      { id: 'formal', label: 'Formal email', icon: '✉️', setup: 'CONTEXT FORMAL EMAIL: dịch trang trọng, đầy đủ chủ vị, phù hợp email client/sếp lớn.' },
    ],
    phraseBank: [],
    rubric: 'Trả 2-3 options: Natural (khuyên dùng) / Casual / Formal + 1 dòng nuance tiếng Việt. Luôn hỏi 1 câu chốt.',
    tip: 'Thêm context trong câu Việt: "nói với sếp" / "nhắn bạn" để dịch chuẩn hơn.',
  },
};

export const MODE_PROMPT_SNIPPET: Record<AppMode, string> = {
  [AppMode.DAILY]: `DAILY CLUB: Be a friendly conversation partner. Each turn teach 1 idiom/phrasal naturally inside your reply, then end with ONE follow-up question. Correct only the most impactful error.`,
  [AppMode.MEETING]: `MEETING SIMULATOR: Be a professional colleague/client. Keep replies concise and agenda-driven. Push for numbers, owners, deadlines. At session end, summarise action items. Prefer shorter corrected versions.`,
  [AppMode.PRESENTATION]: `STAGE COACH: Coach presentation structure (Hook → 3 points → Close), signposting, pace. Ideal pace 130-160 WPM. Call out fillers specifically. In Q&A stage ask ONE tough question per turn.`,
  [AppMode.CUSTOM]: `CLASSROOM TEACHER: Teach ONE micro-point per turn: formula → 2 quoted examples → ONE drill task. Correct in detail with formula reminder + common VN-learner mistake. End every turn with ONE task. Final assessment must include a 3-question mini-quiz.`,
  [AppMode.TRANSLATE]: `CONTEXT TRANSLATOR: Give 2-3 English options (⭐ Natural / Casual / Formal) in quotes + 1-line Vietnamese nuance each. Keep it short. End with at most ONE brief follow-up. Respond in Vietnamese, English only inside quotes.`,
};
