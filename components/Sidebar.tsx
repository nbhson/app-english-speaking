import React from 'react';
import { AppMode } from '../types';
import { MODE_CONFIGS } from '../modes';

interface SidebarItemProps {
  mode: AppMode;
  active: boolean;
  onClick: (mode: AppMode) => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ mode, active, onClick }) => {
  const mc = MODE_CONFIGS[mode];
  return (
    <button
      onClick={() => onClick(mode)}
      className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-2xl border transition-all text-left ${
        active
          ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
          : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
      }`}
      aria-current={active ? 'page' : undefined}
      aria-label={`Select ${mc.title} mode`}
    >
      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${active ? 'bg-white' : mc.dot}`} aria-hidden />
      <span className="min-w-0">
        <span className="block font-bold text-xs lg:text-sm leading-tight">{mc.title}</span>
        <span className={`block text-[10px] leading-tight mt-0.5 truncate ${active ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>{mc.tagline}</span>
      </span>
    </button>
  );
};

interface SidebarProps {
  activeMode: AppMode;
  onChangeMode: (mode: AppMode) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeMode, onChangeMode }) => (
  <nav className="flex flex-col space-y-2 overflow-y-auto pr-2 shrink-0" aria-label="Practice Modes">
    <div className="mb-4">
      <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-4 mb-2">
        Practice Modes
      </h2>
      <div className="space-y-1.5">
        {Object.values(AppMode).map((m) => (
          <SidebarItem key={m} mode={m} active={activeMode === m} onClick={onChangeMode} />
        ))}
      </div>
    </div>
    <div className={`rounded-2xl p-4 border ${MODE_CONFIGS[activeMode].accent}`}>
      <h3 className="font-bold text-sm mb-1">{MODE_CONFIGS[activeMode].coachRole} Tip</h3>
      <p className="text-xs leading-relaxed opacity-90">
        {MODE_CONFIGS[activeMode].tip}
      </p>
    </div>
  </nav>
);
