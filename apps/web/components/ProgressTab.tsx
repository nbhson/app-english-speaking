import React, { useState } from 'react';
import { Target } from 'lucide-react';
import type { AppMode } from '../types';
import type { ProgressDay, SessionRecord } from '../types';
import { MODE_CONFIGS } from '../modes';
import {
  bestStreak, getWeeklyGoalMinutes, last7DaysStats, minutesThisWeek,
  modeDistribution, setWeeklyGoalMinutes,
} from '../utils/storage';
import { cardCls, btnGhost } from '../utils/ui';

const StatTile: React.FC<{ value: React.ReactNode; label: string; title?: string }> = ({ value, label, title }) => (
  <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 text-center min-w-0" title={title}>
    <div className="text-2xl font-bold dark:text-white truncate">{value}</div>
    <div className="text-[11px] font-bold text-slate-400 uppercase">{label}</div>
  </div>
);

/** SVG progress ring for the weekly goal (F1). */
export const ProgressTab: React.FC<{
  progress: ProgressDay[];
  sessions: SessionRecord[];
  streak: number;
  xp: number;
}> = ({ progress, sessions, streak, xp }) => {
  const [goal, setGoal] = useState(() => getWeeklyGoalMinutes());
  const [goalDraft, setGoalDraft] = useState<string | null>(null);

  const weekMin = minutesThisWeek(progress);
  const pct = Math.min(1, weekMin / Math.max(1, goal));
  const l7 = last7DaysStats(progress);
  const best = bestStreak(progress);
  const scores = sessions.map((s) => Number(s.avgScore)).filter((v) => Number.isFinite(v) && v > 0);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const dist = modeDistribution(sessions);
  const distMax = dist[0]?.count ?? 1;

  const R = 30;
  const ring = `hsl(217 91% 60%)`;
  const commitGoal = (m: number) => {
    setWeeklyGoalMinutes(m);
    setGoal(m);
    setGoalDraft(null);
  };

  return (
    <div className="space-y-4">
      {/* F1 — Weekly goal ring */}
      <div className={`${cardCls} p-4 flex items-center gap-4`}>
        <div className="relative shrink-0" style={{ width: 84, height: 84 }} role="img"
          aria-label={`Weekly goal: ${weekMin} of ${goal} minutes (${Math.round(pct * 100)}%)`}
        >
          <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
            <circle cx="42" cy="42" r={R} fill="none" strokeWidth="8" className="stroke-slate-100 dark:stroke-slate-800" />
            <circle
              cx="42" cy="42" r={R} fill="none" strokeWidth="8" strokeLinecap="round"
              stroke={ring}
              strokeDasharray={2 * Math.PI * R}
              strokeDashoffset={(1 - pct) * 2 * Math.PI * R}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold dark:text-white">{Math.round(pct * 100)}%</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase">of goal</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="flex items-center gap-1.5 text-sm font-bold dark:text-white">
            <Target size={14} className="text-blue-500" aria-hidden /> Weekly goal
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <span className="font-bold text-blue-600 dark:text-blue-400">{weekMin}m</span> this week · target{' '}
            {goalDraft === null ? (
              <button
                onClick={() => setGoalDraft(String(goal))}
                className="underline decoration-dotted underline-offset-2 hover:text-blue-600 transition-colors"
                title="Chỉnh mục tiêu tuần"
                aria-label={`Edit weekly goal (currently ${goal} minutes)`}
              >
                {goal}m
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 ml-1">
                <input
                  type="number"
                  min={30}
                  max={3000}
                  step={15}
                  value={goalDraft}
                  autoFocus
                  onChange={(e) => setGoalDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitGoal(Number(goalDraft));
                    if (e.key === 'Escape') setGoalDraft(null);
                  }}
                  className="w-16 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5 text-xs dark:text-white"
                  aria-label="Weekly goal minutes"
                />
                <button className={btnGhost} onClick={() => commitGoal(Number(goalDraft))}>Set</button>
              </span>
            )}
          </p>
          <div className="flex gap-1.5 mt-2">
            {[60, 150, 300].map((m) => (
              <button key={m} onClick={() => { setWeeklyGoalMinutes(m); setGoal(m); }} className={btnGhost}>
                {m}m
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile value={`🔥 ${streak}`} label="day streak" title="Chuỗi ngày học liên tiếp (tính theo giờ local)" />
        <StatTile value={`⚡ ${xp}`} label="total XP" />
        <StatTile value={sessions.length} label="sessions" />
      </div>

      {/* F3 — Last 7 days + all-time */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatTile value={`${l7.minutes}m`} label="7-day minutes" />
        <StatTile value={l7.sessions} label="7-day sessions" />
        <StatTile value={l7.xp} label="7-day XP" />
        <StatTile value={`🏅 ${best}`} label="best streak" title="Chuỗi ngày học liên tiếp dài nhất" />
        <StatTile value={avgScore !== null ? `⭐ ${avgScore.toFixed(1)}` : '—'} label="avg score /5" title="Điểm trung bình các buổi gần nhất" />
      </div>

      {/* Mode distribution */}
      {dist.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase mt-2 mb-2">Practice mix</h4>
          <div className="space-y-1.5">
            {dist.map(({ mode, count }) => {
              const mc = MODE_CONFIGS[mode as AppMode];
              return (
                <div key={mode} className="flex items-center gap-2" title={`${count} session(s) — ${mc?.title ?? mode}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${mc?.dot ?? 'bg-slate-400'}`} aria-hidden />
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 w-36 truncate">{mc?.title ?? mode}</span>
                  <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${mc?.dot ?? 'bg-slate-400'}`} style={{ width: `${(count / distMax) * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h4 className="text-xs font-bold text-slate-400 uppercase mt-2">Last 14 days</h4>
      <div className="flex items-end gap-1.5 h-24">
        {progress.slice(0, 14).reverse().map((d) => (
          <div key={d.date} title={`${d.date}: ${d.sessions} sessions, ${d.minutes}m, ${d.xp}XP`} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full bg-blue-600/80 rounded-t-md" style={{ height: `${Math.min(80, 6 + d.minutes * 3 + d.sessions * 6)}px` }} />
            <span className="text-[9px] text-slate-400">{d.date.slice(5)}</span>
          </div>
        ))}
        {progress.length === 0 && <p className="text-xs text-slate-400">Học 1 buổi để bắt đầu streak.</p>}
      </div>
    </div>
  );
};
