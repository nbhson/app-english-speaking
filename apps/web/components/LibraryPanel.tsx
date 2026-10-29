import React, { useEffect, useRef, useState } from 'react';
import { X, Trash2, Volume2, Download, Check, RotateCcw, GraduationCap, MessageCircle, Upload, FileJson, Clock, RefreshCw, Plus, Search, ChevronDown, ChevronUp } from 'lucide-react';
import type { AIConfig } from '../utils/api';
import type { AppMode } from '../types';
import type { MistakeEntry, ProgressDay, SessionRecord, TaskEntry, VocabEntry } from '../types';
import {
  getSessions, clearSessions, transcriptToMarkdown, downloadText,
  getMistakes, markMistakeReviewed, deleteMistake,
  getVocab, deleteVocab, markVocabReviewed,
  getTasks, addTask, setTaskCompleted, deleteTask,
  getProgress, getStreak, totalXP,
  exportLibrary, importLibrary, exportAnkiTSV,
} from '../utils/storage';
import {
  fetchSessions, fetchMistakes, fetchVocab, fetchProgress, fetchTasks,
  mirrorClearSessions, mirrorMistakeReviewed, mirrorDeleteMistake, mirrorDeleteVocab,
  mirrorTask, mirrorTaskCompleted, mirrorDeleteTask,
  migrateLocalToServer, pendingCount, flushPendingQueue,
} from '../utils/serverStore';
import { isDue, dueInLabel } from '../utils/srs';
import { speakAmbient } from '../utils/tts';
import { useModalFocus } from '../hooks/useModalFocus';
import { useToast } from './Toast';
import { ProgressTab } from './ProgressTab';
import { MODE_CONFIGS } from '../modes';
import { inputCls, toggleCls, btnGhost, cardCls } from '../utils/ui';

/** Safe mode chip for history rows — imported/legacy rows may carry unknown enums. */
const ModeChip: React.FC<{ mode: string }> = ({ mode }) => {
  const mc = MODE_CONFIGS[mode as AppMode];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
        mc?.accent ?? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${mc?.dot ?? 'bg-slate-400'}`} aria-hidden />
      {mc ? mc.title : mode}
    </span>
  );
};

interface Props {
  config: AIConfig;
  onClose: () => void;
  onPractice?: (mode: AppMode, prefill: string) => void;
}

type Tab = 'history' | 'mistakes' | 'vocab' | 'tasks' | 'progress';

export const LibraryPanel: React.FC<Props> = ({ config, onClose, onPractice }) => {
  const [tab, setTab] = useState<Tab>('history');
  const [refresh, setRefresh] = useState(0);
  const [sessions, setSessions] = useState<SessionRecord[]>(() => getSessions());
  const [mistakes, setMistakes] = useState<MistakeEntry[]>(() => getMistakes());
  const [vocab, setVocab] = useState<VocabEntry[]>(() => getVocab());
  const [tasks, setTasks] = useState<TaskEntry[]>(() => getTasks());
  const [progress, setProgress] = useState<ProgressDay[]>(() => getProgress());
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [query, setQuery] = useState('');
  const toast = useToast();
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
  // Two-step inline confirm for destructive clear (replaces window.confirm)
  const [confirmClear, setConfirmClear] = useState(false);
  // F5: expanded session row — read the full transcript in-app (no download needed)
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const streak = getStreak();
  const xp = totalXP();

  // Active-tab search filter — case-insensitive across the tab's text fields.
  const q = query.trim().toLowerCase();
  const matchQ = (s: string | undefined) => (s ?? '').toLowerCase().includes(q);
  const fSessions = q === '' ? sessions : sessions.filter((s) => s.mode.toLowerCase().includes(q) || s.transcript.some((m) => m.text.toLowerCase().includes(q)));
  const fMistakes = q === '' ? mistakes : mistakes.filter((m) => matchQ(m.original) || matchQ(m.corrected) || matchQ(m.explanation) || matchQ(m.alternative));
  const fVocab = q === '' ? vocab : vocab.filter((v) => matchQ(v.word) || matchQ(v.translation) || matchQ(v.example));
  const fTasks = q === '' ? tasks : tasks.filter((t) => matchQ(t.title) || matchQ(t.description));
  const noResults = q !== '' && fSessions.length === 0 && fMistakes.length === 0 && fVocab.length === 0 && fTasks.length === 0;

  const bump = () => {
    setRefresh((v) => v + 1);
    try {
      setPending(pendingCount());
    } catch {
      /* ignore */
    }
  };

  // Focus trap + Escape + body scroll lock + focus restore (a11y)
  useModalFocus(dialogRef, onClose);

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
      const [s, m, v, t, p] = await Promise.all([
        fetchSessions(), fetchMistakes(), fetchVocab(), fetchTasks(), fetchProgress(),
      ]);
      if (cancelled) return;
      setSessions(s.list);
      setMistakes(m.list);
      setVocab(v.list);
      setTasks(t.list);
      setProgress(p.list);
      setRemote(s.remote || m.remote || v.remote || t.remote || p.remote);
    })();
    return () => { cancelled = true; };
  }, [tab, refresh]);

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="My Learning Library">
      <div ref={dialogRef} tabIndex={-1} className="w-full sm:max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[88vh] flex flex-col overflow-hidden focus:outline-none">
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
                onClick={() => { void flushPendingQueue().then(() => { bump(); toast?.show('Đã đồng bộ thay đổi lên server', 'success'); }); }}
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
          {([['history', '🕘 History'], ['mistakes', `🐞 Mistakes (${mistakes.length})`], ['vocab', `🔖 Vocab (${vocab.length})`], ['tasks', `✅ Tasks (${tasks.filter((t) => !t.completed).length})`], ['progress', `🔥 Progress · ${streak}d · ${xp}XP`]] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={toggleCls(tab === t)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Global search — filters the active tab's items (case-insensitive) */}
        <div className="px-4 sm:px-6 pb-1 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm trong Library… (session, lỗi, từ vựng, task)"
              className={`${inputCls} pl-8 pr-8`}
              aria-label="Search library"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 sm:py-4 pb-[env(safe-area-inset-bottom)] space-y-3">
          {noResults && (
            <p className="text-sm text-slate-400 text-center py-6" role="status">
              Không tìm thấy kết quả nào cho “{query}”.
            </p>
          )}
          {tab === 'history' && (
            <>
              {fSessions.length === 0 && q === '' && <p className="text-sm text-slate-400">Chưa có session nào. Học xong 1 buổi sẽ tự lưu ở đây.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    if (confirmClear) {
                      clearSessions();
                      mirrorClearSessions();
                      setConfirmClear(false);
                      bump();
                      toast?.show('Đã xóa toàn bộ lịch sử session');
                    } else {
                      setConfirmClear(true);
                      setTimeout(() => setConfirmClear(false), 4000);
                    }
                  }}
                  className={`text-[11px] font-bold transition-colors ${confirmClear ? 'text-white bg-red-600 px-2 py-1 rounded-lg' : 'text-slate-400 hover:text-red-500'}`}
                  title={confirmClear ? 'Bấm lần nữa để xác nhận' : 'Xóa toàn bộ lịch sử (yêu cầu xác nhận)'}
                >
                  {confirmClear ? '⚠️ Xóa thật? Bấm lần nữa' : 'Clear all history'}
                </button>
                <span className="flex-1" />
                <button
                  onClick={() => downloadText(`fluentdev-backup-${new Date().toISOString().slice(0, 10)}.json`, exportLibrary())}
                  className={btnGhost}
                  title="Backup toàn bộ Library ra file JSON"
                >
                  <FileJson size={11} /> Export JSON
                </button>
                <button
                  onClick={() => downloadText(`fluentdev-anki-${new Date().toISOString().slice(0, 10)}.tsv`, exportAnkiTSV())}
                  className={btnGhost}
                  title="Xuất mistakes + vocab ra TSV để import vào Anki"
                >
                  <Download size={11} /> Anki TSV
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className={btnGhost}
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
                        const stats = importLibrary(String(reader.result || ''));
                        bump();
                        toast?.show(`Import thành công: ${stats.sessions} sessions · ${stats.mistakes} mistakes · ${stats.vocab} từ · ${stats.tasks} tasks`, 'success');
                      } catch (err) {
                        setImportError(err instanceof Error ? err.message : 'Import failed');
                        toast?.show(`Import thất bại: ${err instanceof Error ? err.message : 'file không hợp lệ'}`, 'error');
                      }
                    };
                    reader.readAsText(f);
                    e.target.value = '';
                  }}
                />
              </div>
              {importError && <p className="text-[11px] text-red-500">{importError}</p>}
              {fSessions.map((s) => {
                const expanded = expandedSessionId === s.id;
                return (
                <div key={s.id} className={`${cardCls} p-4`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <button
                      onClick={() => setExpandedSessionId(expanded ? null : s.id)}
                      className="flex items-center gap-2 flex-wrap text-sm font-bold dark:text-white text-left group"
                      aria-expanded={expanded}
                      aria-controls={`session-detail-${s.id}`}
                      title={expanded ? 'Thu gọn transcript' : 'Xem transcript'}
                    >
                      {expanded ? <ChevronUp size={14} className="text-blue-500 shrink-0" aria-hidden /> : <ChevronDown size={14} className="text-slate-400 group-hover:text-blue-500 shrink-0 transition-colors" aria-hidden />}
                      <ModeChip mode={s.mode} />
                      <span>·</span>
                      <span>{new Date(s.startedAt).toLocaleString()}</span>
                      <span>· {Math.round(Number(s.durationSec) / 60)}m</span>
                      <span>· {s.turns} turns</span>
                      <span>· ⭐ {Number.isFinite(Number(s.avgScore)) ? Number(s.avgScore).toFixed(1) : '—'}</span>
                    </button>
                    <button
                      onClick={() => downloadText(`fluentdev-${s.mode}-${s.id.slice(-6)}.md`, transcriptToMarkdown(s.transcript, s.mode))}
                      className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700"
                    >
                      <Download size={12} /> .md
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Corrections: {s.corrections} · Vocab: {s.vocabPoints} · Confidence: {s.confidence}%</p>
                  {expanded && (
                    <div id={`session-detail-${s.id}`} className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2 max-h-72 overflow-y-auto">
                      {s.transcript.length === 0 && (
                        <p className="text-[11px] text-slate-400">Buổi này không có transcript.</p>
                      )}
                      {s.transcript.map((m, i) => (
                        <div key={m.id ?? `${s.id}-${i}`} className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-blue-50 dark:bg-blue-900/20 text-slate-700 dark:text-slate-200' : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300'}`}>
                          <span className={`block text-[10px] font-bold uppercase tracking-wider mb-0.5 ${m.role === 'user' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                            {m.role === 'user' ? 'You' : 'Coach'}
                          </span>
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          {m.suggestion && (
                            <p className="mt-1 text-[11px] italic text-emerald-700 dark:text-emerald-400">💡 {m.suggestion}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </>
          )}

          {tab === 'mistakes' && (
            <>
              {fMistakes.length === 0 && q === '' && <p className="text-sm text-slate-400">Chưa có lỗi nào. Mỗi [Correction] của Coach sẽ tự lưu vào đây để ôn.</p>}
              {fMistakes.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock size={11} /> {fMistakes.filter((m) => !m.mastered && isDue(m.nextReview)).length} due
                  </span>
                  <button
                    onClick={() => setDueOnly((v) => !v)}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg ${dueOnly ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
                  >
                    {dueOnly ? 'Showing: Due only' : 'Show: All'}
                  </button>
                </div>
              )}
              {(dueOnly ? fMistakes.filter((m) => !m.mastered && isDue(m.nextReview)) : [...fMistakes].sort((a, b) => Number(isDue(a.nextReview)) - Number(isDue(b.nextReview)) || (a.nextReview ?? 0) - (b.nextReview ?? 0)))
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
                    <button onClick={() => speakAmbient(config, m.alternative || m.corrected)} className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500" title="Nghe lại" aria-label="Listen">
                      <Volume2 size={13} />
                    </button>
                    {onPractice && (
                      <button onClick={() => onPractice('custom' as AppMode, m.corrected)} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-lg" title="Luyện lại lỗi này trong Custom Class">
                        <GraduationCap size={11} /> Luyện lại
                      </button>
                    )}
                    <button onClick={() => { markMistakeReviewed(m.id); mirrorMistakeReviewed(m.id); bump(); toast?.show('Đã review 1 lần'); }} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg" title="Đã ôn 1 lần">
                      <RotateCcw size={11} /> Reviewed ({m.reviewCount})
                    </button>
                    <button onClick={() => { markMistakeReviewed(m.id, true); mirrorMistakeReviewed(m.id, true); bump(); toast?.show('Mastered! Ghi nhớ tốt lắm 🎉', 'success'); }} className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-green-50 text-green-700 rounded-lg">
                      <Check size={11} /> Mastered
                    </button>
                    <button onClick={() => { deleteMistake(m.id); mirrorDeleteMistake(m.id); bump(); toast?.show('Đã xóa lỗi'); }} className="ml-auto p-1.5 text-slate-300 hover:text-red-500" aria-label="Delete mistake">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'vocab' && (
            <>
              {fVocab.length === 0 && q === '' && <p className="text-sm text-slate-400">Hover vào từ → bấm 📑 để lưu. Sổ từ sẽ hiện ở đây.</p>}
              {fVocab.length > 0 && (
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock size={11} /> {fVocab.filter((v) => isDue(v.nextReview)).length} due · bấm ✓ khi đã ôn xong 1 từ
                </p>
              )}
              <div className="grid gap-2">
                {[...fVocab].sort((a, b) => Number(isDue(a.nextReview)) - Number(isDue(b.nextReview)) || (a.nextReview ?? 0) - (b.nextReview ?? 0)).map((v) => (
                  <div key={v.id} className="flex items-center gap-3 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm dark:text-white">{v.word}</span>
                      <span className="text-xs text-blue-600 ml-2">{v.translation}</span>
                      {v.ipa && <span className="text-[10px] font-mono text-slate-400 ml-2">{v.ipa}</span>}
                      {v.example && <p className="text-[11px] italic text-slate-500 truncate">“{v.example}”</p>}
                      <p className="text-[10px] text-slate-400 mt-0.5">{dueInLabel(v.nextReview)}{v.reviewCount > 0 ? ` · reviewed ${v.reviewCount}x` : ''}</p>
                    </div>
                    <button onClick={() => speakAmbient(config, v.word)} className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500" aria-label={`Listen ${v.word}`}>
                      <Volume2 size={13} />
                    </button>
                    {onPractice && (
                      <button onClick={() => onPractice('daily' as AppMode, `Help me practice using the word "${v.word}" in conversation`)} className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-lg" title="Đặt câu với từ này trong Daily" aria-label="Practice vocab">
                        <MessageCircle size={13} />
                      </button>
                    )}
                    <button onClick={() => { markVocabReviewed(v.id); bump(); toast?.show(`Đã ôn "${v.word}" — lên lịch SRS lại`); }} className="p-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg" title="Đã ôn từ này (lên lịch SRS)" aria-label={`Mark ${v.word} reviewed`}>
                      <Check size={13} />
                    </button>
                    <button onClick={() => { deleteVocab(v.id); mirrorDeleteVocab(v.id); bump(); toast?.show(`Đã xóa từ "${v.word}"`); }} className="p-1.5 text-slate-300 hover:text-red-500" aria-label="Delete vocab">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'tasks' && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = newTaskTitle.trim();
                  if (!title) return;
                  let dueAt: number | undefined;
                  if (newTaskDue) {
                    const d = new Date(newTaskDue + 'T23:59:59');
                    if (Number.isFinite(d.getTime())) dueAt = d.getTime();
                  }
                  const next = addTask({ title, description: '', dueAt });
                  mirrorTask({ title, description: '', dueAt });
                  setTasks(next);
                  setNewTaskTitle('');
                  setNewTaskDue('');
                  bump();
                  toast?.show(`Đã đăng ký task "${title}"`, 'success');
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Đăng ký task luyện tập, vd: 'Practice 15 phút mỗi ngày'"
                  className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 dark:bg-slate-800 dark:text-white placeholder-slate-400"
                  maxLength={300}
                />
                <input
                  type="date"
                  value={newTaskDue}
                  onChange={(e) => setNewTaskDue(e.target.value)}
                  className="text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 dark:bg-slate-800 dark:text-white"
                  title="Hạn chót (tùy chọn)"
                />
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="flex items-center gap-1 text-xs font-bold px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors"
                >
                  <Plus size={13} /> Add
                </button>
              </form>
              {fTasks.length === 0 && q === '' && (
                <p className="text-sm text-slate-400 mt-2">Chưa có task nào. Đăng ký mục tiêu luyện tập bên trên.</p>
              )}
              {fTasks
                .slice()
                .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
                .map((t) => {
                  const now = Date.now();
                  const isOverdue = t.dueAt != null && t.dueAt < now && !t.completed;
                  const isDueSoon = t.dueAt != null && t.dueAt < now + 24 * 3600 * 1000 && !t.completed && !isOverdue;
                  return (
                    <div
                      key={t.id}
                      className={`flex items-start gap-3 border rounded-2xl px-4 py-3 ${t.completed ? 'border-green-200 dark:border-green-900/30 bg-green-50/50 dark:bg-green-900/10' : 'border-slate-200 dark:border-slate-700'}`}
                    >
                      <button
                        onClick={() => {
                          const next = setTaskCompleted(t.id, !t.completed);
                          mirrorTaskCompleted(t.id, !t.completed);
                          setTasks(next);
                          bump();
                          toast?.show(t.completed ? 'Mở lại task' : 'Hoàn thành task! 👏', 'success');
                        }}
                        className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${t.completed ? 'bg-green-500 border-green-500' : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'}`}
                        aria-label={t.completed ? 'Unmark complete' : 'Mark complete'}
                      >
                        {t.completed && <Check size={11} className="text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold dark:text-white ${t.completed ? 'line-through text-slate-400' : ''}`}>{t.title}</p>
                        {t.dueAt && (
                          <p className={`text-[11px] mt-0.5 ${isOverdue ? 'text-red-500 font-bold' : isDueSoon ? 'text-amber-500' : 'text-slate-400'}`}>
                            {isOverdue ? '⚠️ Overdue: ' : 'Due: '}
                            {new Date(t.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                        {t.completed && t.completedAt && (
                          <p className="text-[10px] text-slate-400 mt-0.5">✓ Completed {new Date(t.completedAt).toLocaleDateString()}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const next = deleteTask(t.id);
                          mirrorDeleteTask(t.id);
                          setTasks(next);
                          bump();
                          toast?.show('Đã xóa task');
                        }}
                        className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                        aria-label="Delete task"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
            </>
          )}

          {tab === 'progress' && <ProgressTab progress={progress} sessions={sessions} streak={streak} xp={xp} />}
        </div>
      </div>
    </div>
  );
};
