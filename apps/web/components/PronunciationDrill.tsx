// F10 — Pronunciation Drill: luyện phát âm từng câu bằng audio thật.
// Luồng: nghe câu mẫu (TTS) → giữ nút ghi âm → STT nhận diện → so khớp từng từ
// với câu mẫu (scorePronunciation) → hiển thị điểm + từ sai/thiếu tô màu.
// Ghi chú trung thực: điểm dựa trên kết quả nhận diện giọng nói (STT), không
// phải phân tích dạng sóng — đủ chính xác để phát hiện từ nói sai/nuốt.

import React, { useEffect, useRef, useState } from 'react';
import { X, Volume2, Mic, RotateCcw, ArrowRight, Trophy, Loader2 } from 'lucide-react';
import type { AIConfig } from '../utils/api';
import { transcribe } from '../utils/api';
import { scorePronunciation, type PronunciationDiff } from '../utils/pronunciation';
import { speakAmbient } from '../utils/tts';
import { useModalFocus } from '../hooks/useModalFocus';
import { btnPrimary, btnSecondary } from '../utils/ui';

interface Props {
  config: AIConfig;
  /** Câu luyện phát âm (≥1 câu). */
  sentences: string[];
  onClose: () => void;
}

const HOLD_KEYS = new Set([' ', 'Spacebar', 'Enter']);

const scoreColor = (score: number): string =>
  score >= 85
    ? 'text-green-600 dark:text-green-400'
    : score >= 60
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-500';

export const PronunciationDrill: React.FC<Props> = ({ config, sentences, onClose }) => {
  const clean = sentences.map((s) => s.trim()).filter(Boolean);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<PronunciationDiff | null>(null);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<number[]>([]); // score per sentence
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const target = clean[idx] ?? '';

  useModalFocus(dialogRef, onClose);

  // Dọn mic stream khi đóng.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  const startRecording = async () => {
    if (recorderRef.current) return;
    try {
      setError(null);
      setResult(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (blob.size === 0) return;
        setProcessing(true);
        transcribe(config, blob)
          .then((txt) => setResult(scorePronunciation(target, txt)))
          .catch((err: unknown) =>
            setError(`STT thất bại: ${err instanceof Error ? err.message : String(err)}`)
          )
          .finally(() => setProcessing(false));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (e) {
      setRecording(false);
      setError('Không lấy được micro — kiểm tra quyền truy cập rồi thử lại.');
      console.error('Mic error', e);
    }
  };

  const stopRecording = () => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
  };

  const next = () => {
    const withResult = result ? [...results, result.score] : results;
    setResults(withResult);
    if (idx + 1 >= clean.length) {
      // xong — giữ summary screen
      setIdx(clean.length); // out of range → summary
      setResult(null);
      return;
    }
    setIdx((v) => v + 1);
    setResult(null);
  };

  const retry = () => {
    setResult(null);
    setError(null);
  };

  // Hold Space to record (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (HOLD_KEYS.has(e.key) && !e.repeat) {
        e.preventDefault();
        if (!result && !processing) void startRecording();
      } else if (e.key === 'ArrowRight' && result) {
        next();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (HOLD_KEYS.has(e.key)) {
        e.preventDefault();
        stopRecording();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, processing, target, idx]);

  const done = idx >= clean.length;
  const avg = results.length ? Math.round(results.reduce((a, b) => a + b, 0) / results.length) : 0;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Luyện phát âm"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-xl sm:rounded-xl shadow-2xl h-[92dvh] sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden focus:outline-none"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-base sm:text-lg font-bold dark:text-white flex items-center gap-2">
            🗣️ Luyện phát âm
            {!done && (
              <span className="text-[11px] font-bold text-slate-400">
                {idx + 1}/{clean.length}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 pb-[env(safe-area-inset-bottom)]">
          {done ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                <Trophy size={28} className="text-blue-600 dark:text-blue-400" aria-hidden />
              </div>
              <h3 className="text-lg font-bold dark:text-white">Hoàn thành!</h3>
              <p className="text-3xl font-bold font-mono tabular-nums dark:text-white">
                <span className={scoreColor(avg)}>{avg}</span>
                <span className="text-base text-slate-400">/100</span>
              </p>
              <p className="text-xs text-slate-400">
                Điểm trung bình {results.length} câu · dựa trên nhận diện giọng nói (STT)
              </p>
              <button onClick={onClose} className={`${btnPrimary} mt-2`}>
                Xong
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Câu mẫu */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-center">
                <p className="text-lg font-bold leading-relaxed dark:text-white">
                  {result
                    ? result.words.map((w, i) => (
                        <span
                          key={i}
                          className={
                            w.status === 'ok'
                              ? ''
                              : w.status === 'wrong'
                                ? 'text-amber-600 dark:text-amber-400 underline decoration-wavy'
                                : 'text-red-500 line-through'
                          }
                        >
                          {w.word}{' '}
                        </span>
                      ))
                    : target}
                </p>
                <button
                  onClick={() => speakAmbient(config, target)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                  aria-label="Nghe câu mẫu"
                >
                  <Volume2 size={14} /> Nghe câu mẫu
                </button>
              </div>

              {/* Kết quả */}
              {result && (
                <div className="text-center" aria-live="polite">
                  <p className="text-3xl font-bold font-mono tabular-nums">
                    <span className={scoreColor(result.score)}>{result.score}</span>
                    <span className="text-base text-slate-400">/100</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {result.score >= 85
                      ? 'Tuyệt vời — gần như chuẩn! 🎉'
                      : result.score >= 60
                        ? 'Khá ổn — luyện lại các từ gạch chân.'
                        : 'Thử nói chậm và rõ từng từ nhé.'}
                  </p>
                  <p className="text-[11px] italic text-slate-400 mt-1 truncate" title={result.said}>
                    STT nghe được: “{result.said || '—'}”
                  </p>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-500 text-center" role="alert">
                  {error}
                </p>
              )}

              <div className="flex-1" />

              {/* Hành động */}
              {!result ? (
                <button
                  type="button"
                  onPointerDown={() => void startRecording()}
                  onPointerUp={stopRecording}
                  onPointerLeave={() => recording && stopRecording()}
                  disabled={processing}
                  className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all select-none touch-none ${
                    recording
                      ? 'bg-red-500 text-white shadow-md'
                      : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] shadow-md shadow-blue-600/25'
                  } disabled:opacity-50`}
                  aria-label={recording ? 'Đang ghi âm — thả để gửi' : 'Giữ để ghi âm'}
                >
                  {processing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Đang nhận diện…
                    </>
                  ) : recording ? (
                    <>
                      <Mic size={16} className="animate-pulse" /> Đang ghi — thả tay để chấm điểm
                    </>
                  ) : (
                    <>
                      <Mic size={16} /> Giữ để nói thử{' '}
                      <span className="text-[10px] opacity-60">(hoặc giữ Space)</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={retry} className={`${btnSecondary} py-3 !text-sm`}>
                    <RotateCcw size={14} /> Nói lại
                  </button>
                  <button onClick={next} className={`${btnPrimary} py-3`} autoFocus>
                    {idx + 1 >= clean.length ? 'Xem kết quả' : 'Câu tiếp theo'} <ArrowRight size={14} />
                  </button>
                </div>
              )}

              <p className="text-[10px] text-slate-400 text-center italic">
                Điểm = độ khớp giữa giọng nói của bạn (qua STT) và câu mẫu. Từ{' '}
                <span className="text-amber-600">gạch chân</span> = nói lệch,{' '}
                <span className="text-red-500">gạch bỏ</span> = không nghe được.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
