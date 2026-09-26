import React, { useEffect, useState } from 'react';
import { Languages, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { AIConfig } from '../utils/api';
import { translatePhrase } from '../utils/api';

interface Props {
  config: AIConfig;
}

export const SelectionTranslator: React.FC<Props> = ({ config }) => {
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Don't trigger if clicking inside translator itself
      const target = e.target as HTMLElement;
      if (target.closest('[data-selection-translator]')) return;

      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 1 && text.split(/\s+/).length > 1) {
        const range = sel?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        if (rect) {
          setSelection({
            text,
            x: rect.left + rect.width / 2,
            y: rect.top + window.scrollY,
          });
          setTranslation(null);
        }
      } else {
        // Delay clearing to allow click on translator button
        setTimeout(() => {
          const currentSel = window.getSelection()?.toString().trim();
          if (!currentSel || currentSel.split(/\s+/).length <= 1) {
            setSelection(null);
          }
        }, 150);
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleTranslate = async () => {
    if (!selection) return;
    setLoading(true);
    try {
      const result = await translatePhrase(config, selection.text);
      setTranslation(result);
    } finally {
      setLoading(false);
    }
  };

  if (!selection) return null;

  return (
    <div
      data-selection-translator
      className="fixed z-[100] -translate-x-1/2 -translate-y-full mb-4"
      style={{ left: selection.x, top: selection.y - 8 }}
      role="dialog"
      aria-label="Phrase translator"
    >
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl p-4 min-w-[200px] max-w-xs border border-white/10"
        >
          {!translation && !loading ? (
            <button
              onClick={handleTranslate}
              className="flex items-center space-x-2 w-full justify-center py-1 hover:text-blue-400 transition-colors"
              aria-label={`Translate phrase: ${selection.text}`}
            >
              <Languages size={14} />
              <span className="text-xs font-bold uppercase tracking-wider">Translate Phrase</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Phrase Translation
                </span>
                <button
                  onClick={() => setSelection(null)}
                  className="text-slate-400 hover:text-white p-1"
                  aria-label="Close translator"
                >
                  <X size={12} />
                </button>
              </div>
              {loading ? (
                <div className="flex items-center space-x-2 py-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <span className="text-xs text-slate-400">Translating...</span>
                </div>
              ) : (
                <p className="text-sm font-medium text-blue-300 leading-relaxed">{translation}</p>
              )}
            </div>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900/95" />
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
