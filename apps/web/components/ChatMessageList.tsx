import React from 'react';
import { motion } from 'motion/react';
import { Languages, Sparkles, Loader2 } from 'lucide-react';
import { AppMode, TranscriptionEntry } from '../types';
import { MessageMarkdown } from './MessageMarkdown';
import { CorrectionCard } from './CorrectionCard';

/**
 * Language of a message bubble for assistive tech (screen readers pick the
 * right voice). The UI chrome is Vietnamese (index.html lang="vi") but the
 * conversation itself is English except in translate mode.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function langFor(mode: AppMode): string | undefined {
  if (mode === AppMode.TRANSLATE) return 'vi';
  return 'en';
}

/** Split model text into markdown parts + inline [Correction] cards. */
function renderMessageText(
  text: string,
  tone: 'coach' | 'user' = 'coach',
): React.ReactNode[] {
  const correctionRegex = /\[Correction\]([\s\S]*?)\[\/Correction\]/g;
  const assessmentRegex = /\[Assessment\]([\s\S]*?)\[\/Assessment\]/g;
  const insightRegex = /\[Insight\]([\s\S]*?)\[\/Insight\]/g;

  const cleanText = text.replace(assessmentRegex, '').replace(insightRegex, '').trim();

  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = correctionRegex.exec(cleanText)) !== null) {
    if (match.index > lastIndex) {
      parts.push(cleanText.substring(lastIndex, match.index));
    }
    parts.push(<CorrectionCard key={match.index} content={match[1]} />);
    lastIndex = correctionRegex.lastIndex;
  }
  if (lastIndex < cleanText.length) {
    parts.push(cleanText.substring(lastIndex));
  }

  return parts.map((part, partIdx) => {
    if (typeof part !== 'string') return part;
    if (!part.trim()) return null;
    return <MessageMarkdown key={partIdx} text={part} tone={tone} />;
  });
}

interface ChatMessageListProps {
  entries: TranscriptionEntry[];
  mode: AppMode;
  /** Label above coach bubbles, e.g. the mode's coach role. */
  coachLabel: string;
  /** Rendered before the messages (coach intro pill) when a session just started. */
  intro?: React.ReactNode;
  onToggleTranslation: (entry: TranscriptionEntry) => void;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  entries,
  mode,
  coachLabel,
  intro,
  onToggleTranslation,
}) => (
  <>
    {intro}
    {entries.map((t) => {
      const chatLang = langFor(mode);
      return (
        <div key={t.id} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}>
          <div
            className={`max-w-[92%] sm:max-w-[85%] md:max-w-[70%] p-3 sm:p-4 rounded-2xl relative group/msg ${
              t.error
                ? t.role === 'user'
                  ? 'bg-red-600 text-white rounded-tr-none'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/40 rounded-tl-none'
                : t.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none shadow-sm'
            }`}
            lang={chatLang}
          >
            {t.role === 'model' && (
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">
                {coachLabel}
              </div>
            )}
            <div className="text-sm md:text-base leading-relaxed break-words">
              {t.text === '' && t.role === 'model' ? (
                <span className="inline-flex items-center gap-2 text-slate-400">
                  <Loader2 size={14} className="animate-spin" /> thinking...
                </span>
              ) : (
                renderMessageText(t.text, t.role === 'user' ? 'user' : 'coach')
              )}
            </div>

            <div className="absolute top-2 right-2 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/msg:opacity-100 md:focus-within:opacity-100">
              <button
                onClick={() => onToggleTranslation(t)}
                className={`p-1.5 rounded-lg transition-colors ${
                  t.role === 'user'
                    ? 'bg-white/10 hover:bg-white/20 text-white'
                    : 'bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 shadow-sm'
                }`}
                aria-label={t.translation ? 'Hide translation' : 'Translate full message'}
                title="Translate full message"
              >
                <Languages size={14} />
              </button>
            </div>

            {t.translation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={`mt-3 pt-3 border-t ${
                  t.role === 'user'
                    ? 'border-white/10 text-blue-100'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                } text-xs italic leading-relaxed`}
                lang="vi"
              >
                <div className="flex items-center gap-1.5 mb-1 font-bold uppercase tracking-tighter opacity-70">
                  <Sparkles size={10} />
                  <span>Vietnamese Translation</span>
                </div>
                <MessageMarkdown text={t.translation} tone={t.role === 'user' ? 'user' : 'coach'} />
              </motion.div>
            )}

            {t.role === 'user' && (t.wpm || t.fillerCount) && (
              <div className="text-[10px] font-bold text-blue-100/80">
                {t.wpm ? `${t.wpm} WPM` : ''}
                {t.wpm && t.fillerCount ? ' · ' : ''}
                {t.fillerCount ? `${t.fillerCount} filler${t.fillerCount > 1 ? 's' : ''}` : ''}
              </div>
            )}
          </div>

          {t.role === 'user' && t.suggestion && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-500 max-w-[80%] flex flex-col items-end" lang={t.role === 'user' && mode !== AppMode.TRANSLATE ? 'en' : undefined}>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 rounded-2xl rounded-tr-none py-2 px-4 text-xs md:text-sm shadow-sm">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <span className="text-xs" aria-hidden>
                    💡
                  </span>
                  <span>Natural Phrasing</span>
                </div>
                <p className="italic font-medium leading-relaxed">“{t.suggestion}”</p>
              </div>
            </div>
          )}
        </div>
      );
    })}
  </>
);
