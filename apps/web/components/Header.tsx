import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Sun, Settings, Library, LogOut, ChevronDown, CircleUser } from 'lucide-react';
import { serverAvailable } from '../utils/serverStore';
import { countDueReviews } from '../utils/storage';
import type { AuthUser } from '../utils/auth';

interface Props {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
  /** Bump khi Library đóng (sau khi user ôn thẻ) để tính lại badge SRS due. */
  refreshSignal?: number;
  /** User đang đăng nhập (app yêu cầu login trước khi vào UI chính). */
  authUser: AuthUser;
  onSignOut: () => void;
}

const iconBtn =
  'w-10 h-10 flex items-center justify-center rounded-lg border transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-500/60 outline-none';
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
  authUser,
  onSignOut,
}) => {
  const [libraryOnline, setLibraryOnline] = useState<boolean | null>(null);
  // F6: SRS due badge — tổng mistakes/vocab đến hạn ôn (đếm 30s/lần + khi Library đóng).
  const [due, setDue] = useState(0);
  // Account dropdown: đăng xuất nằm trong menu (tránh bấm nhầm cạnh nút điều hướng).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

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
    let alive = true;
    const recount = () => {
      try {
        setDue(countDueReviews().total);
      } catch {
        /* storage blocked */
      }
    };
    recount();
    const id = window.setInterval(recount, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [refreshSignal]);

  // Đóng menu khi click ra ngoài hoặc bấm Escape (trả focus về nút avatar).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  return (
  <div className="shrink-0 sticky top-0 z-20 w-full max-w-[1600px] mx-auto px-2 sm:px-4 md:px-6 pt-2 sm:pt-4 md:pt-6">
  <header className="h-14 sm:h-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-2 px-2 sm:px-3 transition-colors">
    <div className="flex items-center gap-2 min-w-0 pl-1" data-tour-id="brand">
      <div className="w-9 h-9 shrink-0 bg-blue-600 rounded-lg flex items-center justify-center">
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
      {/* --- Nhóm 1: hành động (Library / Settings / Theme) --- */}
      <button
        onClick={onOpenLibrary}
        className={`${iconBtnIdle} relative`}
        data-tour-id="library-btn"
        aria-label={due > 0 ? `Open learning library — ${due} cards due for review` : 'Open learning library'}
        title={due > 0 ? `My Library — 🐞🔖 ${due} thẻ đến hạn ôn (SRS)` : 'My Library (history, mistakes, vocab, tasks)'}
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
        data-tour-id="settings-btn"
        aria-label="Open AI Connection Settings"
        title="AI Connection Settings"
      >
        <Settings size={18} />
      </button>
      <button
        onClick={toggleDarkMode}
        className={iconBtnIdle}
        data-tour-id="theme-btn"
        aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700" aria-hidden />

      {/* --- Nhóm 2: trạng thái sync (thông tin, không bấm được) --- */}
      {libraryOnline !== null && (
        <div
          className={`hidden md:flex items-center gap-1.5 px-3 h-10 rounded-lg border ${
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

      <div className="hidden md:block w-px h-6 bg-slate-200 dark:bg-slate-700" aria-hidden />

      {/* --- Nhóm 3: danh tính (cùng cực phải theo chuẩn Google/GitHub) --- */}
      <div className="relative" ref={menuRef}>
        <button
          ref={menuBtnRef}
          onClick={toggleMenu}
          className={`flex items-center gap-2 h-10 pl-1.5 pr-2 rounded-lg border transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500/60 outline-none ${
            menuOpen
              ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          data-tour-id="auth-chip"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Tài khoản ${authUser.username} — mở menu`}
          title={`Tài khoản: ${authUser.username}`}
        >
          <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold uppercase" aria-hidden>
            {authUser.username.slice(0, 1)}
          </div>
          <span className="hidden sm:block text-xs font-bold text-slate-700 dark:text-slate-200 max-w-[110px] truncate">
            {authUser.username}
          </span>
          <ChevronDown size={13} className={`text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Tài khoản"
            className="absolute right-0 top-[calc(100%+8px)] w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-9 h-9 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold uppercase" aria-hidden>
                {authUser.username.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{authUser.username}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <CircleUser size={10} aria-hidden /> Đã đăng nhập
                </p>
              </div>
            </div>
            <div className="p-1.5">
              {onOpenLibrary && (
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onOpenLibrary(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <Library size={15} className="text-slate-400" aria-hidden /> My Library
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); onOpenSettings(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
              >
                <Settings size={15} className="text-slate-400" aria-hidden /> Settings
              </button>
              <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" aria-hidden />
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); onSignOut(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
              >
                <LogOut size={15} aria-hidden /> Đăng xuất
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </header>
  </div>
  );
};
