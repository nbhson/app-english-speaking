import React, { useEffect, useRef, useState } from 'react';
import { X, Trash2, Volume2, Download, Check, RotateCcw, GraduationCap, MessageCircle, Upload, FileJson, Clock, RefreshCw } from 'lucide-react';
import type { AIConfig } from '../utils/api';
import type { AppMode } from '../types';
import type { MistakeEntry, ProgressDay, SessionRecord, VocabEntry } from '../types';
import {
  getSessions, clearSessions, transcriptToMarkdown, downloadText,
  getMistakes, markMistakeReviewed, deleteMistake,
  getVocab, deleteVocab, markVocabReviewed,
  getProgress, getStreak, totalXP,
  exportLibrary, importLibrary, exportAnkiTSV,
} from '../utils/storage';
import {
  fetchSessions, fetchMistakes, fetchVocab, fetchProgress,
  mirrorClearSessions, mirrorMistakeReviewed, mirrorDeleteMistake, mirrorDeleteVocab,
  migrateLocalToServer, pendingCount, flushPendingQueue,
} from '../utils/serverStore';
import { isDue, dueInLabel } from '../utils/srs';
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
  const [sessions, setSessions] = useState<SessionRecord[]>(() => getSessions());
  const [mistakes, setMistakes] = useState<MistakeEntry[]>(() => getMistakes());
  const [vocab, setVocab] = useState<VocabEntry[]>(() => getVocab());
  const [progress, setProgress] = useState<ProgressDay[]>(() => getProgress());
  const [remote, setRemote] = useState<boolean | null>(null);
  const [pending, setPending] = useState(() => {
    try {
      return pendingCount();
    } catch {
      return 0;
    }
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [dueOnly, setDueOnly] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streak = getStreak();
  const xp = totalXP();

  const bump = () => {
    setRefresh((v) => v + 1);
    try {
      setPending(pendingCount());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void flushPendingQueue().then((n) => {
      if (cancelled) return;
      if (n > 0) setRefresh((v) => v + 1);
      try {
        setPending(pendingCount());
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // One-time migration: push existing localStorage data into an empty server DB.
    void migrateLocalToServer().then((migrated) => {
      if (migrated && !cancelled) setRefresh((v) => v + 1);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, m, v, p] = await Promise.all([
        fetchSessions(), fetchMistakes(), fetchVocab(), fetchProgress(),
      ]);
      if (cancelled) return;
      setSessions(s.list);
      setMistakes(m.list);
      setVocab(v.list);
      setProgress(p.list);
      setRemote(s.remote || m.remote || v.remote || p.remote);
    })();
    return () => { cancelled = true; };
  }, [tab, refresh]);

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="My Learning Library">
      <div className="w-full sm:max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold dark:text-white">📚 My Learning Library</h2>
            {remote !== null && (
              <span
                title={remote ? 'Đang lưu vào SQLite (data/fluentdev.db)' : 'Server chưa chạy — đang lưu local (trình duyệt)'}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${remote ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
              >
                {remote ? '● SQLite' : '● Local'}
              </span>
            )}
            {pending > 0 && (
              <button
                onClick={() => { void flushPendingQueue().then(() => bump()); }}
                title={`${pending} thay đổi chưa sync lên server — bấm để retry`}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center gap-1"
              >
                <RefreshCw size={10} /> ⏳ {pending} pending
              </button>
            )}
          </div>
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
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => { if (confirm('Xóa toàn bộ lịch sử?')) { clearSessions(); mirrorClearSessions(); bump(); } }}
                  className="text-[11px] font-bold text-slate-400 hover:text-red-500"
                >
                  Clear all history
                </button>
                <span className="flex-1" />
                <button
                  onClick={() => downloadText(`fluentdev-backup-${new Date().toISOString().slice(0, 10)}.json`, exportLibrary())}
                  className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300"
                  title="Backup toàn bộ Library ra file JSON"
                >
                  <FileJson size={11} /> Export JSON
                </button>
                <button
                  onClick={() => downloadText(`fluentdev-anki-${new Date().toISOString().slice(0, 10)}.tsv`, exportAnkiTSV())}
                  className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300"
                  title="Xuất mistakes + vocab ra TSV để import vào Anki"
                >
                  <Download size={11} /> Anki TSV
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300"
                  title="Import file backup JSON (merge, không ghi đè)"
                >
                  <Upload size={11} /> Import
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setImportError(null);
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        importLibrary(String(reader.result || ''));
                        bump();
                      } catch (err) {
                        setImportError(err instanceof Error ? err.message : 'Import failed');
                      }
                    };
                    reader.readAsText(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {importError && <p className="text-[11px] text-red-500">{importError}</p>}
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
              {mistakes.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock size={11} /> {mistakes.filter((m) => !m.mastered && isDue(m.nextReview)).length} due
                  </span>
                  <button
                    onClick={() => setDueOnly((v) => !v)}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg ${dueOnly ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                  >
                    {dueOnly ? 'Showing: Due only' : 'Show: All'}
                  </button>
                </div>
              )}
              {(dueOnly ? mistakes.filter((m) => !m.mastered && isDue(m.nextReview)) : [...mistakes].sort((a, b) => Number(isDue(a.nextReview)) - Number(isDue(b.nextReview)) || (a.nextReview ?? 0) - (b.nextReview ?? 0)))
                .map((m) => (
                <div key={m.id} className={`border rounded-2xl p-4 ${m.mastered ? 'border-green-200 bg-green-50/50 dark:bg-green-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-red-500 line-through flex-1">{m.original}</p>
                    {!m.mastered && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDue(m.nextReview) ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                        {dueInLabel(m.nextReview)}
                      </span>
                    )}
                  </div>
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
                    <button onClick={() => { markMistakeReviewed(m.id); mirrorMistakeReviewed(m.id); bump(); }} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg" title="Đã ôn 1 lần">
                      <RotateCcw size={11} /> Reviewed ({m.reviewCount})
                    </button>
                    <button onClick={() => { markMistakeReviewed(m.id, true); mirrorMistakeReviewed(m.id, true); bump(); }} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-green-50 text-green-700 rounded-lg">
                      <Check size={11} /> Mastered
                    </button>
                    <button onClick={() => { deleteMistake(m.id); mirrorDeleteMistake(m.id); bump(); }} className="ml-auto p-1.5 text-slate-300 hover:text-red-500" aria-label="Delete mistake">
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
              {vocab.length > 0 && (
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock size={11} /> {vocab.filter((v) => isDue(v.nextReview)).length} due · bấm ✓ khi đã ôn xong 1 từ
                </p>
              )}
              <div className="grid gap-2">
                {[...vocab].sort((a, b) => Number(isDue(a.nextReview)) - Number(isDue(b.nextReview)) || (a.nextReview ?? 0) - (b.nextReview ?? 0)).map((v) => (
                  <div key={v.id} className="flex items-center gap-3 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm dark:text-white">{v.word}</span>
                      <span className="text-xs text-blue-600 ml-2">{v.translation}</span>
                      {v.ipa && <span className="text-[10px] font-mono text-slate-400 ml-2">{v.ipa}</span>}
                      {v.example && <p className="text-[11px] italic text-slate-500 truncate">“{v.example}”</p>}
                      <p className="text-[10px] text-slate-400 mt-0.5">{dueInLabel(v.nextReview)}{v.reviewCount > 0 ? ` · reviewed ${v.reviewCount}x` : ''}</p>
                    </div>
                    <button onClick={() => speakWordFireAndForget(config, v.word)} className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500" aria-label={`Listen ${v.word}`}>
                      <Volume2 size={13} />
                    </button>
                    {onPractice && (
                      <button onClick={() => onPractice('daily' as AppMode, `Help me practice using the word "${v.word}" in conversation`)} className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-lg" title="Đặt câu với từ này trong Daily" aria-label="Practice vocab">
                        <MessageCircle size={13} />
                      </button>
                    )}
                    <button onClick={() => { markVocabReviewed(v.id); bump(); }} className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg" title="Đã ôn từ này (lên lịch SRS)" aria-label={`Mark ${v.word} reviewed`}>
                      <Check size={13} />
                    </button>
                    <button onClick={() => { deleteVocab(v.id); mirrorDeleteVocab(v.id); bump(); }} className="p-1.5 text-slate-300 hover:text-red-500" aria-label="Delete vocab">
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
