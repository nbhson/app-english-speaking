// F7 — SRS Review Session: flashcard-style drill for due Mistakes + Vocab cards.
// Replaces the "just tap Reviewed" flow with an active-recall loop:
//   front (prompt) → reveal (answer) → self-grade.
// "Nhớ rồi" advances the card's SRS schedule (markReviewed); "Chưa nhớ"
// re-queues the card once at the end of the session without scheduling.
// Local-first: SRS schedule lives in localStorage; mistakes reviews are
// mirrored to the server (vocab review stays local-only, same as LibraryPanel).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Volume2, Check, RotateCcw, Eye, Trophy, Layers } from 'lucide-react';
import type { AIConfig } from '../utils/api';
import type { MistakeEntry, VocabEntry } from '../types';
import {
  getMistakes, getVocab, markMistakeReviewed, markVocabReviewed,
} from '../utils/storage';
import { mirrorMistakeReviewed } from '../utils/serverStore';
import { speakAmbient } from '../utils/tts';
import { useModalFocus } from '../hooks/useModalFocus';
import { useToast } from './Toast';
import { btnPrimary, btnSecondary } from '../utils/ui';

type Card =
  | { kind: 'mistake'; entry: MistakeEntry }
  | { kind: 'vocab'; entry: VocabEntry };

interface Props {
  config: AIConfig;
  onClose: () => void;
  /** Bump LibraryPanel refresh sau khi có thẻ được review. */
  onChanged: () => void;
}

export const ReviewSession: React.FC<Props> = ({ config, onClose, onChanged }) => {
  // Build the deck once at open: due mistakes (unmastered) first, then due vocab,
  // each ordered by nextReview so the most overdue card comes first.
  const initialDeck = useMemo<Card[]>(() => [
    ...getMistakes()
      .filter((m) => !m.mastered)
      .sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))
      .map((entry): Card => ({ kind: 'mistake', entry })),
    ...getVocab()
      .sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))
      .map((entry): Card => ({ kind: 'vocab', entry })),
  ], []);

  const [queue, setQueue] = useState<Card[]>(initialDeck);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [requeued, setRequeued] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ good: 0, again: 0 });
  const reviewedRef = useRef(0); // số thẻ đã commit SRS (cho onChanged khi đóng sớm)
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  const done = idx >= queue.length;
  const card = !done ? queue[idx] : null;
  const total = queue.length;

  useModalFocus(dialogRef, onClose);

  // Commit the pending-refresh signal when the session closes after reviews.
  const closeWithRefresh = () => {
    if (reviewedRef.current > 0) onChanged();
    onClose();
  };

  const gradeGood = () => {
    if (!card) return;
    const { kind, entry } = card;
    if (kind === 'mistake') {
      markMistakeReviewed(entry.id);
      mirrorMistakeReviewed(entry.id);
    } else {
      markVocabReviewed(entry.id);
    }
    reviewedRef.current += 1;
    setStats((s) => ({ ...s, good: s.good + 1 }));
    setRevealed(false);
    setIdx((v) => v + 1);
  };

  const gradeAgain = () => {
    if (!card) return;
    const key = `${card.kind}:${card.entry.id}`;
    // Re-queue once so the user sees the card again after the first pass.
    if (!requeued.has(key)) {
      setRequeued((prev) => new Set(prev).add(key));
      setQueue((q) => [...q, card]);
    }
    setStats((s) => ({ ...s, again: s.again + 1 }));
    setRevealed(false);
    setIdx((v) => v + 1);
  };

  // Keyboard: Space/Enter = reveal → grade good; 1 = again; 2 = good; Escape = close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return; // handled by useModalFocus
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        else gradeGood();
      } else if (e.key === '1' && revealed) {
        gradeAgain();
      } else if (e.key === '2' && revealed) {
        gradeGood();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, idx, done, card]);

  const finish = () => {
    if (reviewedRef.current > 0) {
      toast?.show(`Ôn xong: ${stats.good} thẻ nhớ, ${stats.again} thẻ cần xem lại 🎉`, 'success');
    }
    closeWithRefresh();
  };

  return (
    <div
      className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Ôn tập SRS"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full sm:max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-xl sm:rounded-xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[88vh] flex flex-col overflow-hidden focus:outline-none"
      >
        {/* Header: progress + close */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base sm:text-lg font-bold dark:text-white flex items-center gap-1.5">
              <Layers size={17} className="text-blue-500" aria-hidden /> Ôn tập nhanh
            </h2>
            {!done && (
              <span className="text-[11px] font-bold text-slate-400 shrink-0" aria-live="polite">
                {idx + 1}/{total}
              </span>
            )}
          </div>
          <button
            onClick={done ? finish : closeWithRefresh}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400"
            aria-label={done ? 'Kết thúc ôn tập' : 'Đóng (tiến độ đã ôn vẫn được lưu)'}
          >
            <X size={18} />
          </button>
        </div>
        {/* Progress bar */}
        {!done && (
          <div className="h-1 bg-slate-100 dark:bg-slate-800 shrink-0">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${total === 0 ? 0 : (idx / total) * 100}%` }}
            />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-6 pb-[env(safe-area-inset-bottom)]">
          {done ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                <Trophy size={28} className="text-green-600 dark:text-green-400" aria-hidden />
              </div>
              <h3 className="text-lg font-bold dark:text-white">Hoàn thành buổi ôn!</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                <span className="font-bold text-green-600 dark:text-green-400">{stats.good}</span> thẻ nhớ ·{' '}
                <span className="font-bold text-amber-600 dark:text-amber-400">{stats.again}</span> thẻ cần xem lại
              </p>
              <p className="text-[11px] text-slate-400">
                Lịch SRS đã cập nhật — thẻ nhớ sẽ quay lại sau 1 → 3 → 7 → 14 → 30 ngày.
              </p>
              <button onClick={finish} className={`${btnPrimary} mt-2`}>
                <Check size={14} /> Xong
              </button>
            </div>
          ) : card ? (
            <div className="flex flex-col h-full gap-4">
              {/* Prompt side */}
              <div className="text-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {card.kind === 'mistake' ? '🐞 Sửa câu này' : '🔖 Từ vựng — nghĩa là gì?'}
                </span>
                {card.kind === 'mistake' ? (
                  <p className="mt-2 text-lg font-bold leading-relaxed text-slate-800 dark:text-white">
                    “{card.entry.original}”
                  </p>
                ) : (
                  <div className="mt-2 flex flex-col items-center gap-2">
                    <p className="text-3xl font-bold text-slate-800 dark:text-white">{card.entry.word}</p>
                    {card.entry.ipa && (
                      <p className="text-sm font-mono text-slate-400">{card.entry.ipa}</p>
                    )}
                    <button
                      onClick={() => speakAmbient(config, card.entry.word)}
                      className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"
                      aria-label="Nghe phát âm"
                    >
                      <Volume2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Answer side */}
              {revealed && card.kind === 'mistake' && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2 bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-sm font-bold text-red-500 line-through">{card.entry.original}</p>
                  <p className="text-base font-bold text-green-700 dark:text-green-300">{card.entry.corrected}</p>
                  {card.entry.alternative && (
                    <p className="text-sm italic text-blue-700 dark:text-blue-300">“{card.entry.alternative}”</p>
                  )}
                  {card.entry.explanation && (
                    <p className="text-[11px] italic text-slate-500 dark:text-slate-400">Why: {card.entry.explanation}</p>
                  )}
                  <button
                    onClick={() => speakAmbient(config, card.entry.alternative || card.entry.corrected)}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600 transition-colors"
                  >
                    <Volume2 size={12} /> Nghe lại
                  </button>
                </div>
              )}
              {revealed && card.kind === 'vocab' && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2 bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-base font-bold text-blue-600 dark:text-blue-400">{card.entry.translation || '—'}</p>
                  {card.entry.example && (
                    <p className="text-sm italic text-slate-500 dark:text-slate-400">“{card.entry.example}”</p>
                  )}
                </div>
              )}

              <div className="flex-1" />

              {/* Actions */}
              {!revealed ? (
                <button onClick={() => setRevealed(true)} className={`${btnPrimary} w-full py-3`} autoFocus>
                  <Eye size={16} /> Hiện đáp án <span className="text-[10px] opacity-60">(Space)</span>
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={gradeAgain} className={`${btnSecondary} py-3 !text-sm border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20`}>
                    <RotateCcw size={14} /> Chưa nhớ <span className="text-[10px] opacity-60">(1)</span>
                  </button>
                  <button onClick={gradeGood} className={`${btnPrimary} py-3`} autoFocus>
                    <Check size={14} /> Nhớ rồi <span className="text-[10px] opacity-60">(2)</span>
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
