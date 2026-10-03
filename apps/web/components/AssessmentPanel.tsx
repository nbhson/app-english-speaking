import React from 'react';
import { motion } from 'motion/react';
import { Search } from 'lucide-react';
import type { SessionAssessment } from '../types';
import { AppMode } from '../types';
import { MODE_CONFIGS } from '../modes';
import { deriveInsight } from '../utils/assessment';
import { avgSkill, cefrFromAvg } from '../utils/speechMetrics';

export const SessionStat: React.FC<{
  icon: string;
  label: string;
  value: string | number;
  unit?: string;
}> = ({ icon, label, value, unit = '' }) => (
  <div className="flex flex-col items-center justify-center p-2 sm:p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 min-w-0">
    <span className="text-lg sm:text-xl mb-1" aria-hidden>
      {icon}
    </span>
    <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate">{label}</span>
    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
      {value}
      {unit}
    </span>
  </div>
);

export const AssessmentBar: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const percentage = (value / 5) * 100;
  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <div className="w-24 sm:w-36 md:w-48 text-right shrink-0">
        <span className="text-[10px] sm:text-[11px] font-bold text-[#2D8A82] dark:text-[#4ade80] uppercase tracking-wider leading-tight block">
          {label}
        </span>
      </div>
      <div
        className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded-sm relative overflow-hidden border border-slate-200 dark:border-slate-700"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-label={`${label}: ${value} out of 5`}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(#2D8A82 1px, transparent 1px)`,
            backgroundSize: '4px 4px',
          }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 bg-[#2D8A82] dark:bg-[#2D8A82]"
        />
      </div>
      <div className="w-8">
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{value}/5</span>
      </div>
    </div>
  );
};

interface AssessmentPanelProps {
  assessment: SessionAssessment;
  hasData: boolean;
  duration: number;
  avgWpm?: number;
  fillerTotal?: number;
  turns?: number;
  streak?: number;
  xp?: number;
  mode?: AppMode;
}

export const AssessmentPanel: React.FC<AssessmentPanelProps> = ({ assessment, hasData, duration, avgWpm = 0, fillerTotal = 0, turns = 0, streak = 0, xp = 0, mode = AppMode.DAILY }) => {
  const avg = avgSkill(assessment);
  const cefr = hasData ? cefrFromAvg(avg) : '—';
  const mc = MODE_CONFIGS[mode];
  const paceNote = mode === AppMode.PRESENTATION ? (avgWpm > 0 ? (avgWpm < 130 ? ' hơi chậm' : avgWpm > 160 ? ' hơi nhanh' : ' chuẩn') : '') : '';
  return (
  <div className="flex flex-col h-full p-1 sm:p-2 transition-colors">
    <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
      <span className="text-[#2D8A82]" aria-hidden>
        📊
      </span>{' '}
      Session Statistics
      {hasData && (
        <span className="ml-auto text-[11px] font-bold px-2 py-1 rounded-full bg-blue-600 text-white" title={`Avg score ${avg.toFixed(1)}/5`}>
          {cefr}
        </span>
      )}
    </h3>

    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
      <SessionStat
        icon="⏱️"
        label="Duration"
        value={`${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`}
      />
      <SessionStat icon="📚" label="Vocab" value={assessment.vocabularyPoints} unit=" pts" />
      <SessionStat icon="💪" label="Confidence" value={assessment.confidenceLevel} unit="%" />
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-center">
      {[
        { l: 'WPM', v: avgWpm > 0 ? `${avgWpm}${paceNote}` : '—', t: mode === AppMode.PRESENTATION ? 'Ideal 130-160 WPM' : 'Speaking pace (words/min)' },
        { l: 'Fillers', v: `${fillerTotal}`, t: 'um/uh/like count' },
        { l: 'Turns', v: `${turns}`, t: 'Your spoken turns' },
        { l: `🔥 ${streak}`, v: `${xp}XP`, t: 'Streak + total XP' },
      ].map((s) => (
        <div key={s.l} title={s.t} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl py-2 px-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase">{s.l}</div>
          <div className="text-sm font-bold text-slate-800 dark:text-white">{s.v}</div>
        </div>
      ))}
    </div>

    <div className={`rounded-2xl border px-3 py-2.5 mb-4 text-[11px] leading-relaxed ${mc.accent}`}>
      <span className="font-bold">Focus {mc.title}: </span>{mc.skills.join(' · ')} — {mc.rubric}
    </div>

    <h3 className="text-base sm:text-lg font-bold mb-4 sm:mb-6 md:mb-8 flex items-center gap-2 text-slate-800 dark:text-white">
      <span className="text-blue-600" aria-hidden>
        🎯
      </span>{' '}
      Comprehensive Assessment
    </h3>

    <div className="space-y-3 sm:space-y-4 flex-1">
      {!hasData ? (        <div className="h-full flex flex-col items-center justify-center text-center px-4">
          <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-100 dark:border-slate-700">
            <Search className="text-slate-300 dark:text-slate-600" size={24} />
          </div>
          <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight mb-1">
            Waiting for analysis
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
            Start speaking with your coach. Your performance will be analyzed and displayed here in
            real-time.
          </p>
        </div>
      ) : (
        <>
          <AssessmentBar label="Fluency" value={assessment.fluency} />
          <AssessmentBar label="Listening" value={assessment.listening} />
          <AssessmentBar label="Reflexing" value={assessment.reflexing} />
          <AssessmentBar label="Sentence Flexibility" value={assessment.sentenceFlexibility} />
          <AssessmentBar label="Vocabulary Flexibility" value={assessment.vocabularyFlexibility} />
          <AssessmentBar label="Intonation" value={assessment.intonation} />
          <AssessmentBar label="Linking" value={assessment.linking} />
          <AssessmentBar label="Final Sound" value={assessment.finalSound} />
          <AssessmentBar label="Stress" value={assessment.stress} />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 italic leading-relaxed pt-1">
            * Intonation / Linking / Stress / Final Sound là ước lượng của AI từ transcript (text), không phải phân tích audio thật.
          </p>
        </>
      )}
    </div>

    <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
          Coach Insight
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
          {!hasData ? 'Your coach will provide personalized insights here once the session begins.' : assessment.insight || deriveInsight(assessment)}
        </p>
      </div>
    </div>
  </div>
  );
};
