import React, { useEffect, useState } from 'react';
import { Moon, Sun, Settings, Library } from 'lucide-react';
import { serverAvailable } from '../utils/serverStore';
import { countDueReviews } from '../utils/storage';

interface Props {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
  /** Bump khi Library đóng (sau khi user ôn thẻ) để tính lại badge SRS due. */
  refreshSignal?: number;
}

const iconBtn =
  'w-10 h-10 flex items-center justify-center rounded-2xl border transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-500/60 outline-none';
const iconBtnIdle =
  `${iconBtn} bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700`;

/**
 * Real Library-server connectivity badge (replaces the old hardcoded
 * "Coach Online" pill that was always green even when the API was down).
 * Polls /api/health every 20s; null until the first ping resolves.
 */
export const Header: React.FC<Props> = ({
  isDarkMode,
  toggleDarkMode,
  onOpenSettings,
  onOpenLibrary,
  refreshSignal = 0,
}) => {
  const [libraryOnline, setLibraryOnline] = useState<boolean | null>(null);
  // F6: SRS due badge — tổng mistakes/vocab đến hạn ôn (đếm 30s/lần + khi Library đóng).
  const [due, setDue] = useState(0);

  useEffect(() => {
    let alive = true;
    const ping = () => {
      void serverAvailable().then((ok) => {
        if (alive) setLibraryOnline(ok);
      });
    };
    ping();
    const id = window.setInterval(ping, 20000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    try {
      setDue(countDueReviews().total);
    } catch {
      /* storage blocked */
    }
  }, [refreshSignal]);

  return (
  <div className="shrink-0 sticky top-0 z-20 w-full max-w-[1600px] mx-auto px-2 sm:px-4 md:px-6 pt-2 sm:pt-4 md:pt-6">
  <header className="h-14 sm:h-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex items-center justify-between gap-2 px-2 sm:px-3 transition-colors">
    <div className="flex items-center gap-2 min-w-0 pl-1">
      <div className="w-9 h-9 shrink-0 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
        <span className="text-white font-bold" aria-hidden>
          F
        </span>
      </div>
      <div className="leading-tight min-w-0">
        <h1 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white truncate">FluentDev</h1>
        <p className="hidden sm:block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Speaking Coach</p>
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={onOpenLibrary}
        className={`${iconBtnIdle} relative`}
        aria-label={due > 0 ? `Open learning library — ${due} cards due for review` : 'Open learning library'}
        title={due > 0 ? `My Library — 🐞🔖 ${due} thẻ đến hạn ôn (SRS)` : 'My Library (history, mistakes, vocab)'}
      >
        <Library size={18} />
        {due > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold shadow"
            aria-hidden
          >
            {due > 99 ? '99+' : due}
          </span>
        )}
      </button>
      <button
        onClick={onOpenSettings}
        className={iconBtnIdle}
        aria-label="Open AI Connection Settings"
        title="AI Connection Settings"
      >
        <Settings size={18} />
      </button>
      <button
        onClick={toggleDarkMode}
        className={iconBtnIdle}
        aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      {libraryOnline !== null && (
        <div
          className={`hidden md:flex items-center gap-1.5 pl-3 pr-3 h-10 rounded-2xl border ${
            libraryOnline
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/40'
              : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
          }`}
          title={libraryOnline ? 'Library server đang chạy — dữ liệu lưu SQLite (data/fluentdev.db)' : 'Library server không phản hồi — dữ liệu lưu localStorage'}
        >
          <div className={`w-2 h-2 rounded-full ${libraryOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} aria-hidden></div>
          <span className="text-[11px] font-bold uppercase tracking-wider">
            {libraryOnline ? 'Library Sync' : 'Local Only'}
          </span>
        </div>
      )}
    </div>
  </header>
  </div>
  );
};
