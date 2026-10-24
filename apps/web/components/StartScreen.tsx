import React from 'react';
import { AppMode } from '../types';
import { MODE_CONFIGS } from '../modes';

interface StartScreenProps {
  mode: AppMode;
  scenarioId: string;
  customTopic: string;
  startError: string | null;
  onStart: () => void;
  onScenario: (id: string) => void;
  onTopic: (v: string) => void;
}

/** Landing view before a session starts (mode intro, scenarios, starters, CTA). */
export const StartScreen: React.FC<StartScreenProps> = ({
  mode,
  scenarioId,
  customTopic,
  startError,
  onStart,
  onScenario,
  onTopic,
}) => {
  const mc = MODE_CONFIGS[mode];

  return (
    <div className="min-h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8 px-2">
      <div className={`w-full text-left rounded-2xl border px-4 py-3 mb-5 ${mc.accent}`}>
        <div className="text-xs font-bold uppercase tracking-widest opacity-70">{mc.coachRole} · {mc.tagline}</div>
        <div className="text-lg font-bold">{mc.title}</div>
        <div className="text-xs mt-1 opacity-80">{mc.description}</div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {mc.skills.map((s) => (
            <span key={s} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 dark:bg-black/20">{s}</span>
          ))}
        </div>
      </div>
      <h2 className="text-2xl font-bold mb-2 dark:text-white">
        {mode === AppMode.TRANSLATE ? 'Ready to Translate?' : mode === AppMode.CUSTOM ? 'Ready for Class?' : 'Ready to Speak English?'}
      </h2>

      {mc.scenarios && (
        <div className="w-full mb-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-left">
            {mode === AppMode.DAILY ? 'Choose a topic' : mode === AppMode.MEETING ? 'Choose meeting type' : mode === AppMode.PRESENTATION ? 'Choose stage' : mode === AppMode.CUSTOM ? 'Choose goal' : 'Choose context'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {mc.scenarios.map((sc) => (
              <button
                key={sc.id}
                onClick={() => onScenario(sc.id)}
                aria-pressed={scenarioId === sc.id}
                className={`text-left px-3 py-2.5 rounded-2xl border text-xs transition-all ${scenarioId === sc.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
              >
                <div className="font-bold text-sm dark:text-white"><span className="mr-1" aria-hidden>{sc.icon}</span>{sc.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === AppMode.CUSTOM && (
        <div className="w-full mb-4 text-left">
          <label htmlFor="custom-topic" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            What do you want to learn today?
          </label>
          <input
            id="custom-topic"
            type="text"
            value={customTopic}
            onChange={(e) => onTopic(e.target.value)}
            placeholder="e.g., used to vs be used to, present perfect..."
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {mc.starters.map((s) => (
              <button key={s} onClick={() => onTopic(s)} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30">{s}</button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400 leading-relaxed" lang="vi">🎓 AI giảng → ví dụ → drill → sửa chi tiết. Cuối buổi có quiz 3 câu.</p>
        </div>
      )}

      {(mode === AppMode.DAILY || mode === AppMode.MEETING || mode === AppMode.PRESENTATION) && (
        <div className="w-full mb-4 text-left">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Quick starters</div>
          <div className="flex flex-wrap gap-1.5">
            {mc.starters.map((s) => (
              <button key={s} onClick={() => onTopic(s)} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30" lang="vi">“{s}”</button>
            ))}
          </div>
        </div>
      )}

      {startError && (
        <div role="alert" className="w-full mb-4 text-left text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3" lang="vi">
          ⚠️ {startError}
        </div>
      )}

      <button
        onClick={onStart}
        disabled={mode === AppMode.CUSTOM && !customTopic.trim()}
        className={`bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-bold transition-all transform hover:scale-105 shadow-lg ${mode === AppMode.CUSTOM && !customTopic.trim() ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
      >
        Start Session Now
      </button>
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500" lang="vi">💡 {mc.tip}</p>
    </div>
  );
};
