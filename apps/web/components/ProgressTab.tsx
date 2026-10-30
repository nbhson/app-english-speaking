import React, { useMemo, useState } from 'react';
import { Target, TrendingUp } from 'lucide-react';
import type { AppMode, ProgressDay, SessionRecord } from '../types';
import { MODE_CONFIGS } from '../modes';
import { sessionMetricValue, type TrendMetric } from '../utils/assessment';
import {
  bestStreak, getWeeklyGoalMinutes, last7DaysStats, minutesThisWeek,
  modeDistribution, setWeeklyGoalMinutes,
} from '../utils/storage';
import { cardCls, btnGhost } from '../utils/ui';

const StatTile: React.FC<{ value: React.ReactNode; label: string; title?: string }> = ({ value, label, title }) => (
  <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center min-w-0" title={title}>
    <div className="text-2xl font-bold dark:text-white truncate">{value}</div>
    <div className="text-[11px] font-bold text-slate-400 uppercase">{label}</div>
  </div>
);

// --- F8 — Score trend (cross-session skill progression) ---

const SKILL_OPTIONS: Array<{ key: TrendMetric; label: string }> = [
  { key: 'overall', label: 'Overall avg' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'listening', label: 'Listening' },
  { key: 'reflexing', label: 'Reflexing' },
  { key: 'sentenceFlexibility', label: 'Sentence Flexibility' },
  { key: 'vocabularyFlexibility', label: 'Vocabulary Flexibility' },
  { key: 'intonation', label: 'Intonation' },
  { key: 'linking', label: 'Linking' },
  { key: 'finalSound', label: 'Final Sound' },
  { key: 'stress', label: 'Stress' },
];
const MAX_TREND_POINTS = 30;

/** SVG line chart of a metric across chronological sessions (0–5 scale). */
const ScoreTrend: React.FC<{ sessions: SessionRecord[] }> = ({ sessions }) => {
  const [metric, setMetric] = useState<string>('overall');

  const points = useMemo(() => {
    const chrono = [...sessions].sort((a, b) => a.startedAt - b.startedAt).slice(-MAX_TREND_POINTS);
    return chrono
      .map((s) => ({ startedAt: s.startedAt, value: sessionMetricValue(s, metric as TrendMetric) }))
      .filter((p): p is { startedAt: number; value: number } => p.value !== null);
  }, [sessions, metric]);

  const W = 320;
  const H = 120;
  const PAD_L = 22;
  const PAD_R = 6;
  const PAD_T = 8;
  const PAD_B = 14;
  const x = (i: number) => (points.length <= 1 ? (PAD_L + W - PAD_R) / 2 : PAD_L + (i * (W - PAD_L - PAD_R)) / (points.length - 1));
  const y = (v: number) => H - PAD_B - (v / 5) * (H - PAD_T - PAD_B);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length > 1 ? `${path} L${x(points.length - 1).toFixed(1)},${H - PAD_B} L${x(0).toFixed(1)},${H - PAD_B} Z` : '';

  // Momentum: mean of last 3 points vs previous 3 (needs ≥ 4 points).
  const delta = useMemo(() => {
    if (points.length < 4) return null;
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const recent = mean(points.slice(-3).map((p) => p.value));
    const before = mean(points.slice(-6, -3).map((p) => p.value));
    return recent - before;
  }, [points]);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mt-2 mb-2">
        <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1.5">
          <TrendingUp size={13} aria-hidden /> Score trend
          {delta !== null && Number.isFinite(delta) && Math.abs(delta) >= 0.05 && (
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                delta > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              }`}
              title="So sánh 3 buổi gần nhất với 3 buổi trước đó"
            >
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}
            </span>
          )}
        </h4>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="text-[11px] font-bold border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-blue-500/60"
          aria-label="Chọn kỹ năng để xem xu hướng"
        >
          {SKILL_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className={`${cardCls} p-3`}>
        {points.length < 2 ? (
          <p className="text-xs text-slate-400 text-center py-8">
            Cần ít nhất 2 buổi có điểm để vẽ xu hướng — hãy luyện thêm nhé!
          </p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Xu hướng ${SKILL_OPTIONS.find((o) => o.key === metric)?.label ?? metric} qua ${points.length} buổi`}>
            {[1, 2, 3, 4, 5].map((v) => (
              <g key={v}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="1" />
                <text x={PAD_L - 4} y={y(v) + 3} textAnchor="end" className="fill-slate-300 dark:fill-slate-600" fontSize="8">{v}</text>
              </g>
            ))}
            {area && <path d={area} fill="url(#trendFill)" opacity="0.35" />}
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity="0.5" />
                <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={path} fill="none" stroke="hsl(217 91% 60%)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <circle
                key={p.startedAt}
                cx={x(i)}
                cy={y(p.value)}
                r={i === points.length - 1 ? 3.5 : 2.2}
                className="fill-blue-600 dark:fill-blue-400"
              >
                <title>{`${new Date(p.startedAt).toLocaleDateString()}: ${p.value.toFixed(1)}/5`}</title>
              </circle>
            ))}
            <text x={PAD_L} y={H - 3} className="fill-slate-300 dark:fill-slate-600" fontSize="8">
              {new Date(points[0].startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
            <text x={W - PAD_R} y={H - 3} textAnchor="end" className="fill-slate-300 dark:fill-slate-600" fontSize="8">
              {new Date(points[points.length - 1].startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          </svg>
        )}
      </div>
    </div>
  );
};

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
  const commitGoal = (raw: string | number) => {
    // Input có thể rỗng/rác (clear rồi Enter) → NaN làm ring render % NaN.
    const n = Math.round(Number(raw));
    const m = Number.isFinite(n) ? Math.min(3000, Math.max(30, n)) : getWeeklyGoalMinutes();
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
                    if (e.key === 'Enter') commitGoal(goalDraft);
                    if (e.key === 'Escape') setGoalDraft(null);
                  }}
                  onBlur={() => commitGoal(goalDraft)}
                  className="w-16 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-0.5 text-xs dark:text-white"
                  aria-label="Weekly goal minutes"
                />
                <button className={btnGhost} onClick={() => commitGoal(goalDraft)}>Set</button>
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

      {/* F8 — Cross-session score/skill trend */}
      <ScoreTrend sessions={sessions} />

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
