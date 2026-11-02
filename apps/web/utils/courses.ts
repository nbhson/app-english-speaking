// Mini Courses: seeded curricula + local-first progress (localStorage).
// Flow: Courses modal → "Bài tiếp theo" → App starts a CUSTOM-class session
// whose LESSON TOPIC is the lesson's `focus` seed; completion is recorded in
// persistSession() when the session ends with an assessment.

import type { Difficulty } from './adaptive';

export interface MiniLesson {
  id: string;
  title: string;
  /** Teaching seed injected as the CUSTOM LESSON TOPIC (hẹp, dạy được 1 buổi). */
  focus: string;
}

export interface MiniCourse {
  id: string;
  title: string;
  blurb: string;
  level: Difficulty;
  icon: string;
  lessons: MiniLesson[];
}

export const MINI_COURSES: MiniCourse[] = [
  {
    id: 'course-present-perfect',
    title: 'Present Perfect Completion',
    blurb: 'Nắm chắc thì rắc rối nhất của người Việt: khi nào dùng present perfect, khi nào past simple.',
    level: 'intermediate',
    icon: '⏳',
    lessons: [
      { id: 'form', title: 'Form: have/has + P2', focus: 'present perfect form: have/has + past participle, common IRREGULAR participles gone, done, seen, taken, written — drill with quick transformation tasks' },
      { id: 'just-already-yet', title: 'just / already / yet', focus: 'present perfect with just, already, yet — position of adverbs and the meaning difference of each, drill with natural replies' },
      { id: 'for-since', title: 'for vs since', focus: 'for vs since with time expressions (for 3 years / since 1990 / since I moved here) and why the time anchor decides the form — drill with fill-in + ask-me tasks' },
      { id: 'vs-past-simple', title: 'Perfect vs Past Simple', focus: 'present perfect vs past simple in one sentence: finished time words (yesterday, in 2021) kill the perfect form, unfinished time (this week, ever) allows it — drill contrast pairs' },
      { id: 'been-gone', title: 'been vs gone', focus: 'have been to vs have gone to — completed visits vs still-away trips, and joining it with experience talk — drill with travel Q&A' },
    ],
  },
  {
    id: 'course-articles',
    title: 'Articles in 5 Days',
    blurb: 'Fix lỗi a/an/the cố hữu của người Việt qua các quy tắc ngắn + drill trong câu nói thật.',
    level: 'beginner',
    icon: '🅰️',
    lessons: [
      { id: 'a-an', title: 'a vs an (sound rule)', focus: 'a vs an by SOUND not letter: an hour, a university, a one-way ticket — drill rapid-fire article choice' },
      { id: 'first-mention', title: 'First mention vs definite', focus: 'a for first mention → the once known: introduce nouns in speech, then refer back with the — drill in short story retell' },
      { id: 'generic', title: 'Generic plural & uncountable', focus: 'talking in general: zero article with plural/uncountable nouns (presidents, coffee) but the + singular for one shared group (the internet, the subway) — drill opinion sentences' },
      { id: 'zero-article', title: 'Zero article sets', focus: 'zero article set phrases: go to school, at work, in bed, by bus, have lunch — plus the exceptions worth memorising — drill daily-routine sentences' },
      { id: 'vn-fixes', title: 'Vietnamese-error fixes', focus: 'top Vietnamese-learner article mistakes: say the before unique nouns, drop redundant articles in job titles + possessives — drill error-correction' },
    ],
  },
  {
    id: 'course-work-en',
    title: 'Work English Essentials',
    blurb: '5 mẫu câu English quan trọng nhất trong công việc: hedge, update, disagree, mở họp, kết email.',
    level: 'intermediate',
    icon: '💼',
    lessons: [
      { id: 'hedging', title: 'Hedging requests', focus: 'softening requests at work: could we possibly, would you mind, might be worth — drill turning demanding sentences into polite ones' },
      { id: 'status-update', title: 'Status updates', focus: 'stand-up style status updates: on track / blocked by / moving to, 30-second concise versions — drill giving updates about a fake project' },
      { id: 'disagree', title: 'Disagree politely', focus: 'diplomatic disagreement: I see it a bit differently, that is fair, but, let us unpack — drill disagreeing with product decisions' },
      { id: 'openers', title: 'Meeting openers', focus: 'opening a meeting smoothly: thanks for joining, purpose of today, agenda + signalling — drill starting 3 meeting types' },
      { id: 'closers', title: 'Email closers', focus: 'professional email closers: action items, next steps, could you confirm, best regards — drill writing-then-speaking a wrap-up' },
    ],
  },
];

const KEY = 'fluentdev-course-progress';

/** courseId → list of completed lessonIds. Local-first, tiny payload. */
export function getCourseProgress(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function markCourseLessonDone(courseId: string, lessonId: string): void {
  try {
    const progress = getCourseProgress();
    const done = new Set(progress[courseId] ?? []);
    done.add(lessonId);
    progress[courseId] = [...done];
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* ignore */
  }
}
