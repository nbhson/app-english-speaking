import React, { useRef, useState } from 'react';
import { Mic, Library, Target, ArrowRight, X } from 'lucide-react';
import { useModalFocus } from '../hooks/useModalFocus';
import { btnPrimary, btnSecondary } from '../utils/ui';

const STEPS: Array<{ icon: React.ReactNode; title: string; body: React.ReactNode }> = [
  {
    icon: <Mic className="text-blue-500" size={28} aria-hidden />,
    title: 'Chào mừng đến FluentDev 👋',
    body: (
      <>
        <p>
          Chọn một <strong>mode</strong> ở sidebar (Daily, Meeting, Presentation, Custom Class, Translate),
          bấm nút micro và nói — Coach sẽ nghe, sửa lỗi ngay trong hội thoại và chấm điểm 9 kỹ năng cuối buổi.
        </p>
        <p className="text-slate-400">Tip: giữ nút <strong>Hold-to-Speak</strong> nếu dùng Custom Provider STT.</p>
      </>
    ),
  },
  {
    icon: <Library className="text-blue-500" size={28} aria-hidden />,
    title: 'Library tự động ghi nhớ',
    body: (
      <>
        <p>
          Mỗi [Correction] của Coach thành <strong>thẻ ôn lỗi</strong>, mỗi từ bạn hover-lưu thành{' '}
          <strong>vocab SRS</strong> (spaced repetition). Toàn bộ nằm trong <strong>Library</strong> (icon 📚 trên Header)
          — có tìm kiếm, xuất Anki/JSON và sync SQLite khi server chạy.
        </p>
      </>
    ),
  },
  {
    icon: <Target className="text-blue-500" size={28} aria-hidden />,
    title: 'Đặt mục tiêu & theo dõi tiến độ',
    body: (
      <>
        <p>
          Tab <strong>Progress</strong> trong Library có vòng <strong>weekly goal</strong> (đặt mục tiêu phút/tuần),
          streak, XP và stats 7 ngày. Hoàn thành vòng mỗi tuần để giữ chuỗi 🔥.
        </p>
      </>
    ),
  },
];

export const ONBOARDING_KEY = 'fluentdev-onboarded-v1';

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return true; // storage blocked → đừng hiện tour mỗi lần mở app
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    /* ignore */
  }
}

/** F2 — 3-step first-run onboarding tour (a11y: dialog, focus trap, Escape, dots + step labels). */
export const Onboarding: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const close = () => {
    markOnboarded();
    onDone();
  };
  useModalFocus(dialogRef, close);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Hướng dẫn sử dụng FluentDev">
      <div ref={dialogRef} tabIndex={-1} className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 focus:outline-none">
        <div className="flex items-start justify-between mb-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center" aria-hidden>
            {s.icon}
          </div>
          <button onClick={close} className="p-2 -m-1 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Bỏ qua hướng dẫn">
            <X size={16} />
          </button>
        </div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">{s.title}</h2>
        <div className="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed" lang="vi">
          {s.body}
        </div>

        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
            ))}
            <span className="sr-only">{`Bước ${step + 1}/${STEPS.length}`}</span>
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => setStep((v) => v - 1)} className={btnSecondary}>
                Back
              </button>
            )}
            <button
              onClick={() => (last ? close() : setStep((v) => v + 1))}
              className={btnPrimary}
              aria-label={last ? 'Hoàn thành hướng dẫn' : 'Sang bước tiếp theo'}
            >
              {last ? 'Bắt đầu học 🚀' : 'Next'} {!last && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
