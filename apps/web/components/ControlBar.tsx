import React from 'react';
import { Mic, X, ChevronRight, Square, RotateCcw, Copy, Download, Sparkles } from 'lucide-react';
import { AppMode } from '../types';
import { MODE_CONFIGS } from '../modes';

export interface ControlAudioState {
  speaking: boolean;
  processing: boolean;
  listening: boolean;
  recording: boolean;
}

interface ControlBarProps {
  mode: AppMode;
  active: boolean;
  audio: ControlAudioState;
  autoListen: boolean;
  engine: 'browser' | 'custom';
  hasReplayable: boolean;
  inputText: string;
  setInputText: (v: string) => void;
  showPhrases: boolean;
  setShowPhrases: (v: boolean) => void;
  copiedAll: boolean;
  onSend: () => void;
  onStopSession: () => void;
  onStopSpeaking: () => void;
  onReplay: () => void;
  onCopyTranscript: () => void;
  onSaveTranscript: () => void;
  onFinish: () => void;
  onStartingSession: () => void;
  onToggleAutoListen: () => void;
  onStartRecognition: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

const HOLD_KEYS = new Set([' ', 'Spacebar', 'Enter']);

export const ControlBar: React.FC<ControlBarProps> = ({
  mode,
  active,
  audio,
  autoListen,
  engine,
  hasReplayable,
  inputText,
  setInputText,
  showPhrases,
  setShowPhrases,
  copiedAll,
  onSend,
  onStopSession,
  onStopSpeaking,
  onReplay,
  onCopyTranscript,
  onSaveTranscript,
  onFinish,
  onStartingSession,
  onToggleAutoListen,
  onStartRecognition,
  onHoldStart,
  onHoldEnd,
}) => {
  const coachTitle = MODE_CONFIGS[mode].title;
  const isTeacher = mode === AppMode.CUSTOM;

  return (
    <div className="p-2 sm:p-4 pb-[env(safe-area-inset-bottom)] bg-slate-50 dark:bg-slate-900/50 border-t dark:border-slate-800 flex flex-col gap-2 sm:gap-3 transition-colors shrink-0">
      {/* Universal text input — works in every mode (mic fallback) */}
      {active && (
        <div className="flex flex-col gap-2">
          {(MODE_CONFIGS[mode].phraseBank?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1">
              <button onClick={() => setShowPhrases(!showPhrases)} className="self-start text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                {showPhrases ? '▾ Hide useful phrases' : '▸ Useful phrases for this mode'}
              </button>
              {showPhrases && (
                <div className="flex flex-wrap gap-1.5">
                  {MODE_CONFIGS[mode].phraseBank!.map((p) => (
                    <button key={p} onClick={() => setInputText(p)} title="Tap to use" className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600">“{p}”</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-white dark:bg-slate-800 p-1.5 sm:p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <label htmlFor="chat-input" className="sr-only">
              Type your message
            </label>
            <input
              id="chat-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder={mode === AppMode.TRANSLATE ? 'Nhập câu tiếng Việt bạn muốn dịch...' : '…or type here if mic fails — Enter to send'}
              className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-[16px] sm:text-sm px-2 dark:text-white outline-none"
              lang={mode === AppMode.TRANSLATE ? 'vi' : 'en'}
            />
            <button
              onClick={onSend}
              disabled={!inputText.trim()}
              className="p-2.5 sm:p-2 shrink-0 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onStopSession()}
              className="p-2.5 sm:p-2 shrink-0 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-500 transition-colors"
              title="Stop Session (auto-saves)"
              aria-label="Stop session"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 pl-1">Audio</span>
            {audio.speaking ? (
              <button
                onClick={onStopSpeaking}
                className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold hover:bg-amber-200 transition-colors"
                title="Interrupt coach (stop speaking)"
                aria-label="Interrupt coach"
              >
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            ) : (
              <button
                onClick={onReplay}
                disabled={!hasReplayable}
                className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors disabled:opacity-40"
                title="Replay last coach reply"
                aria-label="Replay last reply"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Replay
              </button>
            )}
            <button
              onClick={onCopyTranscript}
              className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors"
              title="Copy transcript"
              aria-label="Copy transcript"
            >
              {copiedAll ? <Sparkles className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />} {copiedAll ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onSaveTranscript}
              className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors"
              title="Download transcript (.md)"
              aria-label="Download transcript"
            >
              <Download className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
      )}

      {mode !== AppMode.TRANSLATE && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 sm:space-x-4 flex-wrap gap-y-2 min-w-0">
            <div className="relative flex items-center justify-center">
              <div className={`w-4 h-4 rounded-full ${active ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
              {active && <div className="absolute w-8 h-8 bg-green-500/20 rounded-full animate-ping"></div>}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {active
                  ? audio.processing
                    ? isTeacher ? 'Teacher is checking your answer...' : 'Coach is thinking...'
                    : audio.speaking
                      ? isTeacher ? 'Teacher is explaining...' : 'Coach is speaking...'
                      : audio.listening
                        ? 'Session Active'
                        : 'Listening paused'
                  : 'Ready to Start'}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                {active ? `Mode: ${coachTitle}` : 'Select a mode to begin'}
              </span>
            </div>

            {engine === 'browser' && (
              <button
                onClick={onToggleAutoListen}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  autoListen
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30 text-blue-600 dark:text-blue-400'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                }`}
                aria-pressed={autoListen}
                aria-label={autoListen ? 'Auto-listen enabled' : 'Auto-listen disabled'}
                title={autoListen ? 'Auto-listen ON — talk freely after each reply' : 'Auto-listen OFF — tap Continue after reading the coach reply'}
              >
                <span className={`relative inline-block w-9 h-5 rounded-full transition-colors ${autoListen ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${autoListen ? 'left-[18px]' : 'left-0.5'}`}></span>
                </span>
                Auto-listen
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap gap-y-2">
            {active && engine === 'browser' && audio.listening && !audio.processing && !audio.speaking && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="flex gap-0.5" aria-hidden>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-1 h-3 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}></div>
                  ))}
                </div>
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tight">Listening</span>
              </div>
            )}

            {active && engine === 'browser' && !autoListen && !audio.listening && !audio.processing && !audio.speaking && (
              <button
                onClick={onStartRecognition}
                className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all animate-in fade-in"
                aria-label="Continue listening"
              >
                <Mic size={16} />
                Continue
              </button>
            )}

            {active && engine === 'custom' && (
              <button
                type="button"
                onPointerDown={onHoldStart}
                onPointerUp={onHoldEnd}
                onPointerLeave={onHoldEnd}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onHoldStart();
                }}
                onTouchEnd={onHoldEnd}
                onKeyDown={(e) => {
                  if (HOLD_KEYS.has(e.key) && !e.repeat) {
                    e.preventDefault();
                    onHoldStart();
                  }
                }}
                onKeyUp={(e) => {
                  if (HOLD_KEYS.has(e.key)) {
                    e.preventDefault();
                    onHoldEnd();
                  }
                }}
                className={`flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl font-bold text-sm transition-all border touch-none select-none ${
                  audio.recording
                    ? 'bg-red-500 text-white border-red-500 shadow-red-200 shadow-md'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                aria-label={audio.recording ? 'Recording, release to send' : 'Hold to speak'}
                aria-pressed={audio.recording}
                title="Hold to speak (or press and hold Space)"
              >
                <Mic size={16} className={audio.recording ? 'animate-pulse' : ''} />
                {audio.recording ? 'Recording... release to send' : 'Hold to Speak'}
              </button>
            )}

            {active ? (
              <button
                onClick={onFinish}
                className="w-full sm:w-auto justify-center bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl font-bold text-sm transition-all shadow-md flex items-center gap-2"
              >
                <span aria-hidden>🏁</span>
                Finish &amp; Assess
              </button>
            ) : (
              <button
                onClick={onStartingSession}
                className="w-14 h-14 flex items-center justify-center rounded-full transition-all group relative bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-blue-200 shadow-xl shrink-0"
                aria-label="Start speaking session"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-7 w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                <span className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                  Start Speaking
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
