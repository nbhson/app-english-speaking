import React from 'react';
import { Moon, Sun, PanelLeft, PanelRight, Settings } from 'lucide-react';

interface Props {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  showSidebar: boolean;
  toggleSidebar: () => void;
  showAssessment: boolean;
  toggleAssessment: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<Props> = ({
  isDarkMode,
  toggleDarkMode,
  showSidebar,
  toggleSidebar,
  showAssessment,
  toggleAssessment,
  onOpenSettings,
}) => (
  <header className="h-16 border-b bg-white dark:bg-slate-900 dark:border-slate-800 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 transition-colors">
    <div className="flex items-center space-x-2 md:space-x-4">
      <button
        onClick={toggleSidebar}
        className={`p-2 rounded-xl transition-all ${showSidebar ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
        aria-label={showSidebar ? 'Hide Practice Modes' : 'Show Practice Modes'}
        aria-pressed={showSidebar}
        title={showSidebar ? 'Hide Practice Modes' : 'Show Practice Modes'}
      >
        <PanelLeft size={20} />
      </button>
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold" aria-hidden>
            F
          </span>
        </div>
        <h1 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white">FluentDev</h1>
      </div>
    </div>
    <div className="flex items-center space-x-2 md:space-x-4">
      <button
        onClick={onOpenSettings}
        className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
        aria-label="Open AI Connection Settings"
        title="AI Connection Settings"
      >
        <Settings size={18} />
      </button>
      <button
        onClick={toggleAssessment}
        className={`p-2 rounded-xl transition-all hidden lg:flex ${showAssessment ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
        aria-label={showAssessment ? 'Hide Assessment' : 'Show Assessment'}
        aria-pressed={showAssessment}
        title={showAssessment ? 'Hide Assessment' : 'Show Assessment'}
      >
        <PanelRight size={20} />
      </button>
      <button
        onClick={toggleDarkMode}
        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
        aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="hidden md:flex items-center space-x-1 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-100">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" aria-hidden></div>
        <span className="text-xs font-medium uppercase tracking-wider">Coach Online</span>
      </div>
    </div>
  </header>
);
