import React from 'react';
import { AppMode } from '../types';
import { MODE_INFO } from '../constants';

interface SidebarItemProps {
  mode: AppMode;
  active: boolean;
  onClick: (mode: AppMode) => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ mode, active, onClick }) => {
  const info = MODE_INFO[mode];
  return (
    <button
      onClick={() => onClick(mode)}
      className={`w-full flex items-center space-x-2 px-3 py-2.5 rounded-xl transition-all text-left ${
        active
          ? 'bg-blue-600 text-white shadow-lg'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
      aria-current={active ? 'page' : undefined}
      aria-label={`Select ${info.title} mode`}
    >
      <span className="text-lg" aria-hidden>
        {info.icon}
      </span>
      <span className="font-medium text-xs lg:text-sm">{info.title}</span>
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
      <div className="space-y-1">
        {Object.values(AppMode).map((m) => (
          <SidebarItem key={m} mode={m} active={activeMode === m} onClick={onChangeMode} />
        ))}
      </div>
    </div>
    <div className="mt-auto bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-2xl p-4">
      <h3 className="font-bold text-blue-900 dark:text-blue-300 text-sm mb-1">Coach Pro Tip</h3>
      <p className="text-blue-700 dark:text-blue-400 text-xs leading-relaxed">
        "Try to use transition words like 'Furthermore' or 'On the other hand' to sound more professional."
      </p>
    </div>
  </nav>
);
