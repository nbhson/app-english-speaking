import React from 'react';
import { Moon, Sun, Settings, Library } from 'lucide-react';

interface Props {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
}

const iconBtn =
  'w-10 h-10 flex items-center justify-center rounded-2xl border transition-all active:scale-95';
const iconBtnIdle =
  `${iconBtn} bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700`;
const iconBtnActive =
  `${iconBtn} bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20`;

export const Header: React.FC<Props> = ({
  isDarkMode,
  toggleDarkMode,
  onOpenSettings,
  onOpenLibrary,
}) => (
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
        className={iconBtnIdle}
        aria-label="Open learning library"
        title="My Library (history, mistakes, vocab)"
      >
        <Library size={18} />
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
      <div className="hidden md:flex items-center gap-1.5 pl-3 pr-3 h-10 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-2xl border border-green-200 dark:border-green-800/40">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" aria-hidden></div>
        <span className="text-[11px] font-bold uppercase tracking-wider">Coach Online</span>
      </div>
    </div>
  </header>
  </div>
);
