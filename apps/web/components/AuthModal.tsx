import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useModalFocus } from '../hooks/useModalFocus';
import { login, register } from '../utils/auth';
import { btnPrimary } from '../utils/ui';

interface AuthModalProps {
  onClose: () => void;
  onSignedIn: (username: string) => void;
}

const inputCls =
  'w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white';

/** Đăng nhập / Đăng ký — đơn giản: username + password (cookie httpOnly). */
export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSignedIn }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const close = () => onClose();
  useModalFocus(dialogRef, close);

  const isRegister = mode === 'register';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (busy) return;
    if (isRegister && password !== confirm) {
      setError('Password nhập lại không khớp');
      return;
    }
    setBusy(true);
    const result = isRegister
      ? await register(username.trim(), password)
      : await login(username.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Đã có lỗi xảy ra');
      return;
    }
    if (result.user) onSignedIn(result.user.username);
  };

  const canSubmit =
    username.trim().length >= 3 && password.length >= 6 && (!isRegister || password === confirm);

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-black/40" role="dialog" aria-modal="true" aria-label="Đăng nhập FluentDev">
      <div ref={dialogRef} tabIndex={-1} className="w-full sm:max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-xl sm:rounded-xl p-6 focus:outline-none">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">
              {isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Đồng bộ Library (thẻ lỗi, vocab, streak, XP) giữa các thiết bị.
            </p>
          </div>
          <button onClick={close} className="p-2 -m-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Đóng">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3" lang="vi">
          <div>
            <label htmlFor="auth-username" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Username
            </label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3–32 ký tự: a-z, 0-9, _ . -"
              className={inputCls}
              autoFocus
              maxLength={32}
            />
          </div>
          <label htmlFor="auth-password" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tối thiểu 6 ký tự"
            className={inputCls}
          />
          {isRegister && (
            <>
              <label htmlFor="auth-confirm" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Xác nhận password
              </label>
              <input
                id="auth-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Nhập lại password"
                className={inputCls}
              />
            </>
          )}

          {error && (
            <div role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={busy || !canSubmit} className={`${btnPrimary} w-full justify-center`}>
            {busy ? 'Đang xử lý…' : isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(isRegister ? 'login' : 'register');
            setError(null);
          }}
          className="w-full mt-4 text-xs font-bold text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          type="button"
        >
          {isRegister ? '← Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
        </button>
      </div>
    </div>
  );
};

export default AuthModal;
