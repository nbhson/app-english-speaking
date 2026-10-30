import React, { useEffect, useRef } from 'react';
import type { Driver, DriveStep } from 'driver.js';
import { markOnboarded } from './Onboarding';

const sel = (id: string) => `[data-tour-id="${id}"]`;

/** Element chỉ tour-able khi nó thực sự hiển thị trên màn hình. */
function isTargetable(el: Element | null): boolean {
  if (!el) return false;
  if (el.getClientRects().length === 0) return false; // display:none / detached
  if (el.getBoundingClientRect().width === 0) return false; // invisible w-0
  return getComputedStyle(el).visibility !== 'hidden';
}

interface TourStep {
  /** data-tour-id chính; nếu ẩn/mất sẽ thử `fallback`, cả hai ẩn → step bị skip. */
  element?: string;
  fallback?: string;
  popover: {
    title: string;
    description: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
  };
}

const STEPS: TourStep[] = [
  {
    popover: {
      title: 'Tham quan FluentDev 🗺️',
      description:
        '20 giây để biết mọi thứ nằm ở đâu. Dùng <strong>Next/Back</strong> hoặc ← → để điều hướng, <strong>Esc</strong> để thoát bất kỳ lúc nào.',
    },
  },
  {
    element: 'brand',
    popover: {
      title: 'FluentDev — AI Speaking Coach',
      description:
        'Luyện nói tiếng Anh qua <strong>voice turn-based</strong>: bạn nói → AI Coach nghe, trả lời và sửa lỗi ngay trong hội thoại. Badge <strong>Library Sync</strong> bên phải cho biết dữ liệu đang lưu SQLite hay chỉ local.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: 'modes-btn',
    popover: {
      title: '5 chế độ luyện tập',
      description:
        'Bấm <strong>Modes</strong> để mở sidebar: 🌱 Daily Conversation · 💼 Business Meeting · 🎤 Presentation · 🎓 Custom Class · 🔁 VN→EN Helper. Mỗi mode có scenario riêng (standup, client call, Q&A…).',
      side: 'bottom',
    },
  },
  {
    element: 'start-cta',
    popover: {
      title: 'Bắt đầu buổi luyện',
      description:
        'Chọn topic/kịch bản phía trên rồi bấm <strong>Start Session Now</strong>. Session có đồng hồ đếm giờ và tự lưu khi kết thúc.',
      side: 'bottom',
    },
  },
  {
    element: 'mic-fab',
    popover: {
      title: 'Nói bằng micro 🎙️',
      description:
        'Nút mic bắt đầu phiên luyện nói. Với STT = Custom Provider, giữ <strong>Hold-to-Speak</strong> (hoặc giữ Space) rồi thả để gửi. Không có mic? Gõ text — mọi mode đều nhận.',
      side: 'top',
    },
  },
  {
    element: 'auto-listen-btn',
    popover: {
      title: 'Auto-listen',
      description:
        'Bật để Coach <strong>tự nghe tiếp</strong> sau mỗi lượt của AI — hội thoại chảy liền mạch như nói chuyện thật. Tắt nếu muốn đọc kỹ reply rồi mới nói (bấm <strong>Continue</strong>).',
      side: 'top',
    },
  },
  {
    element: 'chat-panel',
    popover: {
      title: 'Hội thoại realtime + sửa lỗi ngay',
      description:
        'Lời của bạn hiện kèm <strong>WPM & filler</strong> đếm được. Coach sửa lỗi ngay trong câu — hover bất kỳ từ để xem nghĩa, bấm 🔖 để lưu vocab SRS.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: 'assessment-panel',
    fallback: 'stats-fab',
    popover: {
      title: 'Chấm điểm 9 kỹ năng',
      description:
        'Panel phải (hoặc nút 📊 trên mobile) chấm Fluency, Vocabulary, Intonation… thang điểm 5, kèm <strong>radar chart</strong>, WPM, filler count — cập nhật realtime trong lúc nói.',
      side: 'left',
    },
  },
  {
    element: 'auth-chip',
    popover: {
      title: 'Library & Settings — trong menu tài khoản 👤',
      description:
        'Bấm avatar để mở menu tài khoản: <strong>My Library</strong> (mỗi [Correction] thành thẻ ôn lỗi SRS, từ hover-lưu thành vocab, có tìm kiếm + xuất Anki/JSON — badge/chấm vàng = thẻ đến hạn) và <strong>Settings</strong> (Chat Model / STT / TTS, persona). Đăng xuất cũng ở đây.',
      side: 'bottom',
    },
  },
  {
    element: 'theme-btn',
    popover: {
      title: 'Dark / Light mode',
      description:
        'Cả hai theme đều được chăm chút theo cùng một design system — chọn gì cũng đẹp. Thiết lập được nhớ giữa các phiên.',
      side: 'bottom',
    },
  },
  {
    popover: {
      title: 'Sẵn sàng luyện tập? 🚀',
      description:
        'Mỗi buổi luyện tự tích <strong>XP + streak 🔥</strong> — hoàn thành weekly goal để giữ chuỗi. Bấm <strong>Bắt đầu học</strong> rồi nói thử: "Hi coach, what did you do this weekend?"',
    },
  },
];

interface GuidedTourProps {
  onDone: () => void;
}

/**
 * Spotlight tour (driver.js) — chạy sau welcome modal lần đầu (hoặc replay
 * từ Settings → Advanced). driver.js + driver.css được dynamic-import để
 * không nằm trong initial bundle. Steps trỏ tới các element có data-tour-id;
 * step có target đang ẩn (assessment đóng, sidebar đang mở, engine ≠ browser,
 * mobile/desktop khác nhau…) tự bị skip để tour không bao giờ chỉ vào khoảng trống.
 */
export const GuidedTour: React.FC<GuidedTourProps> = ({ onDone }) => {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    let alive = true;

    void Promise.all([import('driver.js'), import('driver.js/dist/driver.css')]).then(([{ driver }]) => {
      if (!alive) return;

      // Resolve từng step: element chính → fallback → centered. Bỏ step có
      // target ẩn/mất để tour không bao giờ chỉ vào khoảng trống.
      const usable: DriveStep[] = STEPS.flatMap((s): DriveStep[] => {
        const pick = (id: string): string | undefined =>
          isTargetable(document.querySelector(sel(id))) ? sel(id) : undefined;
        if (!s.element && !s.fallback) {
          return [{ popover: s.popover }]; // centered step — luôn chạy
        }
        const element = pick(s.element ?? '') ?? (s.fallback ? pick(s.fallback) : undefined);
        return element ? [{ element, popover: s.popover }] : [];
      });

      driverRef.current = driver({
        animate: true,
        duration: 350,
        smoothScroll: false,
        allowClose: true,
        allowKeyboardControl: true,
        overlayColor: '#020617',
        overlayOpacity: 0.65,
        stagePadding: 8,
        stageRadius: 14,
        popoverClass: 'fd-tour-popover',
        showProgress: true,
        progressText: '{{current}} / {{total}}',
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Bắt đầu học 🚀',
        closeBtnLabel: 'Đóng hướng dẫn',
        disableActiveInteraction: true,
        steps: usable,
        onDestroyed: () => {
          markOnboarded();
          onDoneRef.current();
        },
      });
      driverRef.current.drive();
    });

    return () => {
      alive = false;
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  return null;
};
