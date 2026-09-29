import React, { useState, useRef, useEffect } from 'react';
import { Volume2, BookmarkPlus, Check } from 'lucide-react';
import type { AIConfig, WordInfo } from '../utils/api';
import { translateWord } from '../utils/api';
import { translationCache, getInflight, setInflight } from '../utils/translationCache';
import { speakWordFireAndForget } from '../utils/tts';
import { saveVocab } from '../utils/storage';
import { mirrorVocab } from '../utils/serverStore';

interface Props {
  word: string;
  config: AIConfig;
}

export const HoverableWord: React.FC<Props> = ({ word, config }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [data, setData] = useState<WordInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const hoverTimeout = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    abortRef.current?.abort();
  }, []);

  const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
  const isActuallyAWord = cleanWord.length > 0;

  const fetchTranslation = async () => {
    if (!cleanWord) return;
    const cached = translationCache.get(cleanWord);
    if (cached) {
      setData(cached);
      return;
    }
    const shared = getInflight(cleanWord);
    if (shared) {
      const result = await shared;
      if (result) setData(result);
      return;
    }
    // Cancel previous stale request
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const myId = ++reqIdRef.current;
    setLoading(true);
    const p = translateWord(config, cleanWord, ctl.signal);
    setInflight(cleanWord, p);
    try {
      const result = await p;
      if (ctl.signal.aborted || myId !== reqIdRef.current) return;
      if (result) {
        translationCache.set(cleanWord, result);
        setData(result);
      }
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    if (!isActuallyAWord) return;
    hoverTimeout.current = window.setTimeout(() => {
      setShowTooltip(true);
      void fetchTranslation();
    }, 400);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    // Invalidate pending fetch so a fast hover-out/in doesn't show stale data
    reqIdRef.current++;
    setShowTooltip(false);
  };

  const handleFocus = () => {
    if (!isActuallyAWord) return;
    setShowTooltip(true);
    void fetchTranslation();
  };

  const handleBlur = () => {
    setShowTooltip(false);
  };

  if (!isActuallyAWord) return <span>{word}</span>;

  return (
    <span
      className="relative inline-block cursor-help hover:bg-blue-100/50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 rounded px-0.5 transition-colors group font-medium"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={0}
      role="button"
      aria-label={`Translate word ${word}`}
    >
      {word}
      {showTooltip && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 max-w-[70vw] animate-in fade-in zoom-in duration-200">
          <span className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl p-4 text-slate-800 dark:text-slate-200 text-xs block">
            {loading ? (
              <span className="flex items-center space-x-2 py-1">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="text-slate-400 dark:text-slate-500">Translating...</span>
              </span>
            ) : data ? (
              <span className="space-y-2 block">
                <span className="flex justify-between items-center">
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                      {data.translation}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speakWordFireAndForget(config, word);
                      }}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-blue-600 transition-colors"
                      aria-label={`Listen to pronunciation of ${word}`}
                    >
                      <Volume2 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        saveVocab({ word: cleanWord, translation: data.translation, ipa: data.ipa, example: data.example });
                        mirrorVocab({ word: cleanWord, translation: data.translation, ipa: data.ipa, example: data.example });
                        setSaved(true);
                        setTimeout(() => setSaved(false), 1500);
                      }}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-green-600 transition-colors"
                      aria-label={`Save ${word} to vocab notebook`}
                      title="Save to vocab notebook"
                    >
                      {saved ? <Check size={12} className="text-green-600" /> : <BookmarkPlus size={12} />}
                    </button>
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                    {data.ipa}
                  </span>
                </span>
                <span className="h-px bg-slate-100 dark:bg-slate-700 w-full block"></span>
                <p className="italic text-slate-500 dark:text-slate-400 leading-relaxed">"{data.example}"</p>
              </span>
            ) : (
              <span className="text-red-400">Failed to load</span>
            )}
            <span className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white/95 dark:border-t-slate-800/95"></span>
          </span>
        </span>
      )}
    </span>
  );
};
