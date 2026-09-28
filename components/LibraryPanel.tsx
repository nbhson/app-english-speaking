import React, { useMemo, useState } from 'react';
import { X, Trash2, Volume2, Download, Check, RotateCcw, GraduationCap, MessageCircle } from 'lucide-react';
import type { AIConfig } from '../utils/api';
import type { AppMode } from '../types';
import {
  getSessions, clearSessions, transcriptToMarkdown, downloadText,
  getMistakes, markMistakeReviewed, deleteMistake,
  getVocab, deleteVocab,
  getProgress, getStreak, totalXP,
} from '../utils/storage';
import { speakWordFireAndForget } from '../utils/tts';

interface Props {
  config: AIConfig;
  onClose: () => void;
  onPractice?: (mode: AppMode, prefill: string) => void;
}

type Tab = 'history' | 'mistakes' | 'vocab' | 'progress';

export const LibraryPanel: React.FC<Props> = ({ config, onClose, onPractice }) => {
  const [tab, setTab] = useState<Tab>('history');
  const [refresh, setRefresh] = useState(0);
  const sessions = useMemo(() => getSessions(), [refresh, tab]);
  const mistakes = useMemo(() => getMistakes(), [refresh, tab]);
  const vocab = useMemo(() => getVocab(), [refresh, tab]);
  const progress = useMemo(() => getProgress(), [refresh, tab]);
  const streak = getStreak();
  const xp = totalXP();

  const bump = () => setRefresh((v) => v + 1);

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-bold dark:text-white">📚 My Learning Library</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400" aria-label="Close library">
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-2 px-4 sm:px-6 pt-3 sm:pt-4 pb-1 flex-wrap shrink-0">
          {([['history', '🕘 History'], ['mistakes', `🐞 Mistakes (${mistakes.length})`], ['vocab', `🔖 Vocab (${vocab.length})`], ['progress', `🔥 Progress · ${streak}d · ${xp}XP`]] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${tab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 sm:py-4 pb-[env(safe-area-inset-bottom)] space-y-3">
          {tab === 'history' && (
            <>
              {sessions.length === 0 && <p className="text-sm text-slate-400">Chưa có session nào. Học xong 1 buổi sẽ tự lưu ở đây.</p>}
              <button
                onClick={() => { if (confirm('Xóa toàn bộ lịch sử?')) { clearSessions(); bump(); } }}
                className="text-[11px] font-bold text-slate-400 hover:text-red-500"
              >
                Clear all history
              </button>
              {sessions.map((s) => (
                <div key={s.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm font-bold dark:text-white">
                      {s.mode} · {new Date(s.startedAt).toLocaleString()} · {Math.round(s.durationSec / 60)}m · {s.turns} turns · ⭐ {s.avgScore.toFixed(1)}
                    </div>
                    <button
                      onClick={() => downloadText(`fluentdev-${s.mode}-${s.id.slice(-6)}.md`, transcriptToMarkdown(s.transcript, s.mode))}
                      className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700"
                    >
                      <Download size={12} /> .md
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Corrections: {s.corrections} · Vocab: {s.vocabPoints} · Confidence: {s.confidence}%</p>
                </div>
              ))}
            </>
          )}

          {tab === 'mistakes' && (
            <>
              {mistakes.length === 0 && <p className="text-sm text-slate-400">Chưa có lỗi nào. Mỗi [Correction] của Coach sẽ tự lưu vào đây để ôn.</p>}
              {mistakes.map((m) => (
                <div key={m.id} className={`border rounded-2xl p-4 ${m.mastered ? 'border-green-200 bg-green-50/50 dark:bg-green-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                  <p className="text-xs text-red-500 line-through">{m.original}</p>
                  <p className="text-sm font-bold text-green-700 dark:text-green-300">{m.corrected}</p>
                  {m.alternative && <p className="text-sm italic text-blue-700 dark:text-blue-300">“{m.alternative}”</p>}
                  {m.explanation && <p className="text-[11px] text-slate-500 italic mt-1">Why: {m.explanation}</p>}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button onClick={() => speakWordFireAndForget(config, m.alternative || m.corrected)} className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500" title="Nghe lại" aria-label="Listen">
                      <Volume2 size={13} />
                    </button>
                    {onPractice && (
                      <button onClick={() => onPractice('custom' as AppMode, m.corrected)} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg" title="Luyện lại lỗi này trong Custom Class">
                        <GraduationCap size={11} /> Luyện lại
                      </button>
                    )}
                    <button onClick={() => { markMistakeReviewed(m.id); bump(); }} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg" title="Đã ôn 1 lần">
                      <RotateCcw size={11} /> Reviewed ({m.reviewCount})
                    </button>
                    <button onClick={() => { markMistakeReviewed(m.id, true); bump(); }} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-green-50 text-green-700 rounded-lg">
                      <Check size={11} /> Mastered
                    </button>
                    <button onClick={() => { deleteMistake(m.id); bump(); }} className="ml-auto p-1.5 text-slate-300 hover:text-red-500" aria-label="Delete mistake">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'vocab' && (
            <>
              {vocab.length === 0 && <p className="text-sm text-slate-400">Hover vào từ → bấm 📑 để lưu. Sổ từ sẽ hiện ở đây.</p>}
              <div className="grid gap-2">
                {vocab.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm dark:text-white">{v.word}</span>
                      <span className="text-xs text-blue-600 ml-2">{v.translation}</span>
                      {v.ipa && <span className="text-[10px] font-mono text-slate-400 ml-2">{v.ipa}</span>}
                      {v.example && <p className="text-[11px] italic text-slate-500 truncate">“{v.example}”</p>}
                    </div>
                    <button onClick={() => speakWordFireAndForget(config, v.word)} className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500" aria-label={`Listen ${v.word}`}>
                      <Volume2 size={13} />
                    </button>
                    {onPractice && (
                      <button onClick={() => onPractice('daily' as AppMode, `Help me practice using the word "${v.word}" in conversation`)} className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-lg" title="Đặt câu với từ này trong Daily" aria-label="Practice vocab">
                        <MessageCircle size={13} />
                      </button>
                    )}
                    <button onClick={() => { deleteVocab(v.id); bump(); }} className="p-1.5 text-slate-300 hover:text-red-500" aria-label="Delete vocab">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'progress' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold dark:text-white">🔥 {streak}</div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase">day streak</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold dark:text-white">⚡ {xp}</div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase">total XP</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-bold dark:text-white">{sessions.length}</div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase">sessions</div>
                </div>
              </div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
