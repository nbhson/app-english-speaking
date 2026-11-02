// Tools — Grammar Fix: paste đoạn tiếng Anh → bản đã sửa + từng lỗi (original →
// corrected + lý do tiếng Việt). Single-shot chatOnce call, decode JSON.

import React, { useRef, useState } from 'react';
import { SpellCheck, X, Copy, Check, Loader2, ArrowRight, Sparkles } from 'lucide-react';
import type { AIConfig } from '../../utils/api';
import { fixGrammar, type GrammarFixResult } from '../../utils/api';
import { useModalFocus } from '../../hooks/useModalFocus';
import { inputCls, btnPrimary, btnGhost } from '../../utils/ui';

interface Props {
  config: AIConfig;
  onClose: () => void;
}

export const GrammarFixModal: React.FC<Props> = ({ config, onClose }) => {
  const [text, setText] = useState('');
  const [result, setResult] = useState<GrammarFixResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useModalFocus(dialogRef, onClose);

  const run = async () => {
    const src = text.trim();
    if (!src || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fixGrammar(config, src);
      if (res && res.corrected) setResult(res);
      else setError('Không sửa được đoạn này. Kiểm tra kết nối AI rồi thử lại nhé.');
    } catch {
      setError('Có lỗi khi xử lý. Thử lại nhé.');
    } finally {
      setLoading(false);
    }
  };

  const copyCorrected = () => {
    if (!result) return;
    navigator.clipboard?.writeText(result.corrected).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div
      className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Grammar Fix"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full sm:max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-xl sm:rounded-xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[88vh] flex flex-col overflow-hidden focus:outline-none"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-base sm:text-lg font-bold dark:text-white flex items-center gap-1.5">
            <SpellCheck size={17} className="text-sky-500" aria-hidden /> Grammar Fix
            <span className="ml-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300">
              fix
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

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 pb-[env(safe-area-inset-bottom)] space-y-4">
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Paste đoạn email/message/report của bạn ở đây…"
              className={inputCls}
              aria-label="Đoạn tiếng Anh cần sửa"
              maxLength={4000}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-slate-400">{text.length}/4000</span>
              <button onClick={() => void run()} disabled={!text.trim() || loading} className={btnPrimary}>
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Đang sửa…
                  </>
                ) : (
                  <>
                    <Sparkles size={15} /> Sửa bài
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400" lang="vi">
              ⚠️ {error}
            </p>
          )}

          {result && (
            <div className="space-y-3">
              <div className="rounded-xl border border-green-200 dark:border-green-800/40 bg-green-50/60 dark:bg-green-900/10 px-3.5 py-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-green-600 dark:text-green-400">
                    Bản đã sửa
                  </span>
                  <button onClick={copyCorrected} className={btnGhost}>
                    {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                  {result.corrected}
                </p>
              </div>

              {result.fixes.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    {result.fixes.length} lỗi đã sửa
                  </div>
                  <ul className="space-y-2">
                    {result.fixes.map((f, i) => (
                      <li key={i} className="text-xs leading-relaxed">
                        <div className="flex items-start gap-1.5 flex-wrap">
                          <span className="text-red-500 dark:text-red-400 line-through decoration-red-300">
                            {f.original}
                          </span>
                          <ArrowRight size={12} className="mt-1 shrink-0 text-slate-300" aria-hidden />
                          <span className="font-bold text-green-600 dark:text-green-400">{f.corrected}</span>
                        </div>
                        {f.reason && (
                          <p className="text-slate-500 dark:text-slate-400 mt-0.5 pl-1" lang="vi">
                            {f.reason}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.summary && (
                <div className="rounded-lg border border-sky-200 dark:border-sky-800/40 bg-sky-50/70 dark:bg-sky-900/10 px-3.5 py-2.5 text-xs text-sky-800 dark:text-sky-200 leading-relaxed" lang="vi">
                  💡 <b>Nhớ cái này:</b> {result.summary}
                </div>
              )}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="pt-6 text-center text-xs text-slate-400 leading-relaxed" lang="vi">
              <p className="text-4xl mb-2" aria-hidden>✍️</p>
              Paste đoạn văn → nhận bản đã sửa + <b>từng lỗi giải thích bằng tiếng Việt</b>.
              <br />Lỗi lặp lại sẽ được gộp để dễ nhớ.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
