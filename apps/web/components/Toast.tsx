// Global toast notification system — non-blocking feedback for user actions.
// Enterprise conventions: aria-live region, auto-dismiss + manual close,
// max 3 stacked, consistent severity colors, dark-mode aware.

import React, { createContext, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  leaving: boolean;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

const AUTO_DISMISS_MS = 3500;
const LEAVE_MS = 200; // must match the CSS transition duration
const MAX_VISIBLE = 3;

const TYPE_STYLES: Record<ToastType, { bg: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
  success: { bg: 'bg-green-600', Icon: CheckCircle2 },
  error: { bg: 'bg-red-600', Icon: AlertTriangle },
  info: { bg: 'bg-blue-600', Icon: Info },
};

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Track timers so a manually dismissed toast cancels its auto-dismiss.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = (id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    // Play leave animation first, then drop from state.
    setToasts((list) => list.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), LEAVE_MS);
  };

  const show = (message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), { id, message, type, leaving: false }]);
    timers.current.set(
      id,
      setTimeout(() => remove(id), AUTO_DISMISS_MS),
    );
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* aria-live so screen readers announce toasts; container never intercepts clicks */}
      <div
        aria-live="assertive"
        role="status"
        className="fixed z-[300] bottom-4 right-4 left-4 sm:left-auto flex flex-col items-end gap-2 pointer-events-none"
      >
        {toasts.map((t) => {
          const { bg, Icon } = TYPE_STYLES[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-2 max-w-sm w-fit px-4 py-2.5 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-200 ${bg} ${t.leaving ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}
            >
              <Icon size={16} className="shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 ml-1 p-0.5 opacity-70 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
