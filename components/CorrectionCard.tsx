import React, { useState } from 'react';
import { Volume2, Copy, Check } from 'lucide-react';
import { useAIConfig } from '../context/AIConfigContext';
import { speakWordFireAndForget } from '../utils/tts';
import { parseCorrectionFields } from '../utils/storage';

interface Props {
  content: string;
}

export const CorrectionCard: React.FC<Props> = ({ content }) => {
  const config = useAIConfig();
  const [copied, setCopied] = useState(false);
  const { original, corrected, alternative, explanation } = parseCorrectionFields(content);

  // Never render a blank card — a parse miss should not show an empty box.
  if (!original && !corrected && !alternative && !explanation) return null;

  return (
    <div className="my-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
          Correction & Improvement · auto-saved
        </span>
        <span className="flex items-center gap-1">
          <button
            onClick={() => {
              const text = alternative || corrected || '';
              if (text) {
                navigator.clipboard?.writeText(text).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }
            }}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
            aria-label="Copy natural phrasing"
            title="Copy"
          >
            {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
          </button>
          <span className="text-xs" aria-hidden>
            ✨
          </span>
        </span>
      </div>
      <div className="p-4 space-y-4">
        {original && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-red-400 dark:text-red-500 uppercase">Original</span>
            <p className="text-slate-500 dark:text-slate-400 line-through decoration-red-200 dark:decoration-red-900/50 decoration-2">
              {original}
            </p>
          </div>
        )}
        {corrected && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-green-500 dark:text-green-400 uppercase">Corrected</span>
            <p className="text-slate-800 dark:text-slate-200 font-medium">{corrected}</p>
          </div>
        )}
        {alternative && (
          <div className="space-y-1 bg-blue-50/50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100/50 dark:border-blue-800/30 relative group/alt">
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                Better Alternative
              </span>
              <button
                onClick={() => speakWordFireAndForget(config, alternative)}
                className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-lg text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                aria-label={`Listen to alternative: ${alternative}`}
                title="Listen to alternative"
              >
                <Volume2 size={14} />
              </button>
            </div>
            <p className="text-blue-900 dark:text-blue-200 font-semibold italic">"{alternative}"</p>
          </div>
        )}
        {explanation && (
          <div className="pt-2 border-t border-slate-50 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 italic leading-relaxed">
              <span className="font-bold not-italic text-slate-400 dark:text-slate-500 mr-1">Why:</span>
              {explanation}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
