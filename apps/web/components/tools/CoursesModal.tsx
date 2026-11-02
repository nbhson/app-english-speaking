// Mini Courses catalog modal: 3 khoá học seeded × 5 bài, progress tick local-first.
// "Bài tiếp theo" → onLessonStart(course, lesson) → App launches session CUSTOM
// with lesson.focus as LESSON TOPIC.

import React, { useRef, useState } from 'react';
import { X, GraduationCap, Play, CheckCircle2, ArrowRight } from 'lucide-react';
import { MINI_COURSES, getCourseProgress, type MiniCourse, type MiniLesson } from '../../utils/courses';
import { useModalFocus } from '../../hooks/useModalFocus';
import { btnPrimary } from '../../utils/ui';

interface Props {
  onClose: () => void;
  onLessonStart: (lesson: MiniLesson, course: MiniCourse) => void;
}

const LEVEL_LABEL: Record<MiniCourse['level'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const CoursesModal: React.FC<Props> = ({ onClose, onLessonStart }) => {
  const [progress] = useState(() => getCourseProgress());
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useModalFocus(dialogRef, onClose);

  // Optimistic tick: modal closes when a lesson starts, but a finished course
  // can be browsed again without re-reading storage.
  const totalDone = Object.values(progress).reduce((acc, arr) => acc + arr.length, 0);

  return (
    <div
      className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Mini Courses"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full sm:max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-xl sm:rounded-xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[88vh] flex flex-col overflow-hidden focus:outline-none"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-base sm:text-lg font-bold dark:text-white flex items-center gap-1.5">
            <GraduationCap size={17} className="text-blue-500" aria-hidden /> Mini Courses
            <span className="ml-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300">
              course
            </span>
            {totalDone > 0 && (
              <span className="text-[11px] font-bold text-slate-400 ml-1" lang="vi">
                · {totalDone} bài đã xong
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 pb-[env(safe-area-inset-bottom)] space-y-3">
          {MINI_COURSES.map((course) => {
            const done = progress[course.id] ?? [];
            const next = course.lessons.find((l) => !done.includes(l.id));
            const pct = Math.round((done.length / course.lessons.length) * 100);
            return (
              <div
                key={course.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg" aria-hidden>
                      {course.icon}
                    </span>
                    <span className="font-bold text-sm dark:text-white">{course.title}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                      {LEVEL_LABEL[course.level]}
                    </span>
                    <span className="ml-auto text-[10px] font-bold text-slate-400" lang="vi">
                      {done.length}/{course.lessons.length} bài
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed" lang="vi">
                    {course.blurb}
                  </p>
                  <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 mt-2 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <ul className="px-4 pb-1 space-y-0.5">
                  {course.lessons.map((lesson) => {
                    const isDone = done.includes(lesson.id);
                    return (
                      <li key={lesson.id}>
                        <button
                          onClick={() => onLessonStart(lesson, course)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
                          title={lesson.focus}
                        >
                          <span className="shrink-0">
                            {isDone ? (
                              <CheckCircle2 size={14} className="text-green-500" aria-hidden />
                            ) : (
                              <span className="w-[14px] h-[14px] rounded-full border-2 border-slate-300 dark:border-slate-600 inline-block" aria-hidden />
                            )}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className={`block text-xs font-bold truncate ${isDone ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
                              {lesson.title}
                            </span>
                          </span>
                          <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 group-hover:text-blue-500">
                            {next?.id === lesson.id ? <Play size={12} aria-hidden /> : <ArrowRight size={12} aria-hidden />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  {next ? (
                    <button onClick={() => onLessonStart(next, course)} className={`${btnPrimary} !py-1.5 !px-3 !text-xs`}>
                      <Play size={13} /> Bài tiếp theo · {next.title}
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-green-600 dark:text-green-400 flex items-center gap-1" lang="vi">
                      <CheckCircle2 size={13} /> Hoàn thành khoá — chúc mừng! 🎉
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-slate-400 leading-relaxed" lang="vi">
            📚 Học một bài = một buổi Custom Class với AI giáo viên. Buổi xong có điểm đánh giá thì bài tự tick ✓.
            Tiến độ lưu trên máy này.
          </p>
        </div>
      </div>
    </div>
  );
};
