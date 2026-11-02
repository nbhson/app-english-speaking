// Tools — Word Deep-Dive: gõ 1 từ/phrasal verb → bóc tách nghĩa, IPA, register,
// collocations, 3 ví dụ theo tone, và lỗi người Việt hay mắc. Kết quả cache
// module-level (keyed by word) + dedupe in-flight, cùng tinh thần translationCache.
// Lưu nhanh vào Vocab sextion bằng saveVocab (local-first).

import React, { useRef, useState } from 'react';
import { BookOpenText, X, Volume2, BadgeCheck, AlertTriangle, Loader2, Search } from 'lucide-react';
import type { AIConfig } from '../../utils/api';
import { wordDeepDive, type DeepDiveResult } from '../../utils/api';
import { saveVocab } from '../../utils/storage';
import { mirrorVocab } from '../../utils/serverStore';
import { speakAmbient, stopAmbient } from '../../utils/tts';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useToast } from '../Toast';
import { inputCls, btnPrimary } from '../../utils/ui';

const CACHE_LIMIT = 50;
const cache = new Map<string, DeepDiveResult>();

const TONE_STYLE: Record<DeepDiveResult['examples'][number]['tone'], string> = {
  casual: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300',
  business: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300',
  formal: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300',
};

interface Props {
  config: AIConfig;
  onClose: () => void;
}

export const WordDiveModal: React.FC<Props> = ({ config, onClose }) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<DeepDiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedWord, setSavedWord] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  useModalFocus(dialogRef, onClose);

  const lookup = async (raw: string) => {
    const word = raw.trim().replace(/\s+/g, ' ');
    if (!word || loading) return;
    setLoading(true);
    setError(null);
    setSavedWord(null);
    try {
      const cached = cache.get(word.toLowerCase());
      let res: DeepDiveResult | null;
      if (cached) {
        res = cached;
      } else {
        res = await wordDeepDive(config, word);
        if (res) {
          cache.set(word.toLowerCase(), res);
          if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
        }
      }
      if (res) setResult(res);
      else setError('Không tra được từ này. Kiểm tra kết nối AI rồi thử lại nhé.');
    } catch {
      setError('Có lỗi khi tra cứu. Thử lại nhé.');
    } finally {
      setLoading(false);
    }
  };

  const speak = (text: string) => {
    stopAmbient();
    speakAmbient(config, text);
  };

  const saveToVocab = () => {
    if (!result) return;
    const example = result.examples[0]?.text ?? '';
    const translation = result.meaning.split(/[.!?]\s/)[0].slice(0, 80);
    try {
      saveVocab({
        word: result.word,
        translation,
        ipa: result.ipa,
        example,
      });
      mirrorVocab({ word: result.word, translation, ipa: result.ipa, example });
      setSavedWord(result.word);
      toast?.show(`Đã lưu “${result.word}” vào Vocab 🎉`, 'success');
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Word Deep-Dive"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full sm:max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-xl sm:rounded-xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[88vh] flex flex-col overflow-hidden focus:outline-none"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-base sm:text-lg font-bold dark:text-white flex items-center gap-1.5">
            <BookOpenText size={17} className="text-emerald-500" aria-hidden /> Word Deep-Dive
            <span className="ml-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300">
              dict
            </span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 pb-[env(safe-area-inset-bottom)]">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void lookup(query);
                }}
                placeholder="word, phrasal verb… e.g. pull off, leverage"
                className={`${inputCls} pl-9`}
                aria-label="Từ cần bóc tách"
              />
            </div>
            <button onClick={() => void lookup(query)} disabled={!query.trim() || loading} className={btnPrimary}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : 'Deep-dive'}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400" lang="vi">
              ⚠️ {error}
            </p>
          )}

          {result && (
            <div className="mt-4 space-y-4">
              {/* Head row: word + ipa + speak */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{result.word}</span>
                {result.ipa && <span className="text-sm text-slate-400 font-mono">{result.ipa}</span>}
                <button
                  onClick={() => speak(result.word)}
                  className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                  aria-label={`Phát âm ${result.word}`}
                >
                  <Volume2 size={15} />
                </button>
                <button
                  onClick={saveToVocab}
                  disabled={savedWord === result.word}
                  className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    savedWord === result.word
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {savedWord === result.word ? (
                    <>
                      <BadgeCheck size={13} /> Đã lưu
                    </>
                  ) : (
                    'Lưu vào Vocab'
                  )}
                </button>
              </div>

              {result.register && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-bold uppercase tracking-wider text-[10px] mr-1 text-slate-400">Register</span>
                  {result.register}
                </p>
              )}

              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed" lang="vi">
                {result.meaning}
              </p>

              {result.examples.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Ví dụ theo tone</div>
                  <ul className="space-y-1.5">
                    {result.examples.map((ex, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <span className={`shrink-0 mt-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${TONE_STYLE[ex.tone]}`}>
                          {ex.tone}
                        </span>
                        <span className="flex-1 min-w-0">{ex.text}</span>
                        <button
                          onClick={() => speak(ex.text)}
                          className="shrink-0 p-1 text-slate-300 hover:text-emerald-600 transition-colors"
                          aria-label="Phát âm ví dụ"
                        >
                          <Volume2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.collocations.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Collocations hay dùng</div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.collocations.map((c) => (
                      <button
                        key={c}
                        onClick={() => setQuery(c)}
                        className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                        title="Tra sâu từ này"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {result.vnMistake && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-900/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 leading-relaxed" lang="vi">
                  <span className="flex items-center gap-1.5 font-bold mb-0.5">
                    <AlertTriangle size={13} /> Lỗi người Việt hay gặp
                  </span>
                  {result.vnMistake}
                </div>
              )}

              {result.related.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.related.map((r) => (
                    <button
                      key={r}
                      onClick={() => setQuery(r)}
                      className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                      title="Tra sâu từ này"
                    >
                      ↔ {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="mt-8 text-center text-xs text-slate-400 leading-relaxed" lang="vi">
              <p className="text-4xl mb-2" aria-hidden>🔍</p>
              Gõ 1 từ → nhận IPA, register, collocations, 3 ví dụ theo tone
              <br />và <b>lỗi người Việt hay mắc</b> với từ đó.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
