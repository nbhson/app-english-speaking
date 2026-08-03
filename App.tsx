
import React, { useState, useEffect, useRef } from 'react';
import { AppMode, TranscriptionEntry, SessionState, SessionAssessment, SpeechRecognition } from './types';
import { SYSTEM_INSTRUCTION, MODE_INFO } from './constants';
import {
  AIConfig,
  ChatMessage,
  loadConfig,
  chatStream,
  translateWord,
  translatePhrase,
  transcribe,
  speech,
} from './utils/api';
import { SettingsModal } from './components/SettingsModal';
import {
  Languages, Sparkles, Mic, X, ChevronRight, Volume2, Search,
  Moon, Sun, PanelLeft, PanelRight, Settings, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Translation cache (keyed by word) ---

interface WordInfo {
  translation: string;
  ipa: string;
  example: string;
}

const translationCache = new Map<string, WordInfo>();

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Component for individual hoverable words
const HoverableWord: React.FC<{ word: string; config: AIConfig }> = ({ word, config }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [data, setData] = useState<WordInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const hoverTimeout = useRef<number | null>(null);

  const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
  const isActuallyAWord = cleanWord.length > 0;

  const fetchTranslation = async () => {
    if (!cleanWord) return;
    if (translationCache.has(cleanWord)) {
      setData(translationCache.get(cleanWord)!);
      return;
    }

    setLoading(true);
    const result = await translateWord(config, cleanWord);
    if (result) {
      translationCache.set(cleanWord, result);
      setData(result);
    }
    setLoading(false);
  };

  const handleMouseEnter = () => {
    if (!isActuallyAWord) return;
    hoverTimeout.current = window.setTimeout(() => {
      setShowTooltip(true);
      fetchTranslation();
    }, 400);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setShowTooltip(false);
  };

  if (!isActuallyAWord) return <span>{word}</span>;

  return (
    <span
      className="relative inline-block cursor-help hover:bg-blue-100/50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 rounded px-0.5 transition-colors group font-medium"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {word}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 animate-in fade-in zoom-in duration-200">
          <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl p-4 text-slate-800 dark:text-slate-200 text-xs">
            {loading ? (
              <div className="flex items-center space-x-2 py-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <span className="text-slate-400 dark:text-slate-500">Translating...</span>
              </div>
            ) : data ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">{data.translation}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); speakWord(config, word); }}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <Volume2 size={12} />
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{data.ipa}</span>
                </div>
                <div className="h-px bg-slate-100 dark:bg-slate-700 w-full"></div>
                <p className="italic text-slate-500 dark:text-slate-400 leading-relaxed">"{data.example}"</p>
              </div>
            ) : (
              <span className="text-red-400">Failed to load</span>
            )}
            {/* Tooltip Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white/95 dark:border-t-slate-800/95"></div>
          </div>
        </div>
      )}
    </span>
  );
};

// Speak a single word via the configured TTS engine.
const speakWord = async (config: AIConfig, word: string) => {
  try {
    if (config.ttsEngine === 'omniroute') {
      const blob = await speech(config, word);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    }
  } catch (e) {
    console.error('TTS error', e);
  }
};

const CorrectionCard: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  const original = lines.find(l => l.startsWith('Original:'))?.replace('Original:', '').trim();
  const corrected = lines.find(l => l.startsWith('Corrected:'))?.replace('Corrected:', '').trim();
  const alternative = lines.find(l => l.startsWith('Alternative:'))?.replace('Alternative:', '').trim();
  const explanation = lines.find(l => l.startsWith('Explanation:'))?.replace('Explanation:', '').trim();

  return (
    <div className="my-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-2 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Correction & Improvement</span>
        <span className="text-xs">✨</span>
      </div>
      <div className="p-4 space-y-4">
        {original && (
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-red-400 dark:text-red-500 uppercase">Original</span>
            <p className="text-slate-500 dark:text-slate-400 line-through decoration-red-200 dark:decoration-red-900/50 decoration-2">{original}</p>
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
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">Better Alternative</span>
              <button
                onClick={() => speakWordFromCorrection(alternative)}
                className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-lg text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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

// CorrectionCard's speaker needs a config; route through the latest config.
let latestConfig: AIConfig;
const speakWordFromCorrection = async (text: string) => {
  if (latestConfig) speakWord(latestConfig, text);
};

// --- MAIN COMPONENTS ---

const SidebarItem: React.FC<{
  mode: AppMode;
  active: boolean;
  onClick: (mode: AppMode) => void;
}> = ({ mode, active, onClick }) => {
  const info = MODE_INFO[mode];
  return (
    <button
      onClick={() => onClick(mode)}
      className={`w-full flex items-center space-x-2 px-3 py-2.5 rounded-xl transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-lg'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <span className="text-lg">{info.icon}</span>
      <span className="font-medium text-xs lg:text-sm">{info.title}</span>
    </button>
  );
};

const Header: React.FC<{
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  showSidebar: boolean;
  toggleSidebar: () => void;
  showAssessment: boolean;
  toggleAssessment: () => void;
  onOpenSettings: () => void;
}> = ({ isDarkMode, toggleDarkMode, showSidebar, toggleSidebar, showAssessment, toggleAssessment, onOpenSettings }) => (
  <header className="h-16 border-b bg-white dark:bg-slate-900 dark:border-slate-800 flex items-center justify-between px-6 sticky top-0 z-20 transition-colors">
    <div className="flex items-center space-x-4">
      <button
        onClick={toggleSidebar}
        className={`p-2 rounded-xl transition-all ${showSidebar ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
        title={showSidebar ? "Hide Practice Modes" : "Show Practice Modes"}
      >
        <PanelLeft size={20} />
      </button>
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold">F</span>
        </div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">FluentDev</h1>
      </div>
    </div>
    <div className="flex items-center space-x-4">
      <button
        onClick={onOpenSettings}
        className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
        title="AI Connection Settings"
      >
        <Settings size={18} />
      </button>
      <button
        onClick={toggleAssessment}
        className={`p-2 rounded-xl transition-all ${showAssessment ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
        title={showAssessment ? "Hide Assessment" : "Show Assessment"}
      >
        <PanelRight size={20} />
      </button>
      <button
        onClick={toggleDarkMode}
        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
        title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="hidden md:flex items-center space-x-1 px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-100">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-xs font-medium uppercase tracking-wider">Coach Online</span>
      </div>
    </div>
  </header>
);

const SelectionTranslator: React.FC<{ config: AIConfig }> = ({ config }) => {
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
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
        setSelection(null);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleTranslate = async () => {
    if (!selection) return;
    setLoading(true);
    const result = await translatePhrase(config, selection.text);
    setTranslation(result);
    setLoading(false);
  };

  if (!selection) return null;

  return (
    <div
      className="fixed z-[100] -translate-x-1/2 -translate-y-full mb-4"
      style={{ left: selection.x, top: selection.y }}
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
            >
              <Languages size={14} />
              <span className="text-xs font-bold uppercase tracking-wider">Translate Phrase</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phrase Translation</span>
                <button onClick={() => setSelection(null)} className="text-slate-400 hover:text-white">
                  <X size={12} />
                </button>
              </div>
              {loading ? (
                <div className="flex items-center space-x-2 py-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <span className="text-xs text-slate-400">Thinking...</span>
                </div>
              ) : (
                <p className="text-sm font-medium text-blue-300 leading-relaxed">{translation}</p>
              )}
            </div>
          )}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900/95"></div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const SessionStat = ({ icon, label, value, unit = '' }: { icon: string, label: string, value: string | number, unit?: string }) => (
  <div className="flex flex-col items-center justify-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
    <span className="text-xl mb-1">{icon}</span>
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</span>
    <span className="text-sm font-bold text-slate-900 dark:text-white">{value}{unit}</span>
  </div>
);

const AssessmentBar: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const percentage = (value / 5) * 100;
  return (
    <div className="flex items-center gap-4">
      <div className="w-48 text-right">
        <span className="text-[11px] font-bold text-[#2D8A82] dark:text-[#4ade80] uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded-sm relative overflow-hidden border border-slate-200 dark:border-slate-700">
        {/* Patterned Background */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(${'#2D8A82'} 1px, transparent 1px)`,
            backgroundSize: '4px 4px',
          }}
        ></div>
        {/* Filled Bar */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 bg-[#2D8A82] dark:bg-[#2D8A82]"
        />
      </div>
      <div className="w-8">
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{value}/5</span>
      </div>
    </div>
  );
};

const INITIAL_ASSESSMENT: SessionAssessment = {
  fluency: 0,
  listening: 0,
  reflexing: 0,
  sentenceFlexibility: 0,
  vocabularyFlexibility: 0,
  intonation: 0,
  linking: 0,
  finalSound: 0,
  stress: 0,
  vocabularyPoints: 0,
  confidenceLevel: 0,
  insight: '',
};

// Build a short, data-driven insight from the current AI scores. Used as a
// fallback when the model didn't include an [Insight] block in its reply.
const deriveInsight = (a: SessionAssessment): string => {
  const skills: [string, number][] = [
    ['Fluency', a.fluency],
    ['Listening', a.listening],
    ['Reflexing', a.reflexing],
    ['Sentence Flexibility', a.sentenceFlexibility],
    ['Vocabulary Flexibility', a.vocabularyFlexibility],
    ['Intonation', a.intonation],
    ['Linking', a.linking],
    ['Final Sound', a.finalSound],
    ['Stress', a.stress],
  ];
  const scored = skills.filter(([, v]) => v > 0);
  if (scored.length === 0) return '';
  const sorted = [...scored].sort((x, y) => y[1] - x[1]);
  const [strongLabel, strong] = sorted[0];
  const [weakLabel, weak] = sorted[sorted.length - 1];
  return strong === weak
    ? `You're consistently at ${strong}/5 across the board. Keep practicing — small daily sessions will push you to the next level.`
    : `💪 Strongest: ${strongLabel} (${strong}/5). 🎯 Focus: ${weakLabel} (${weak}/5) — the biggest gain is waiting there.`;
};

const App: React.FC = () => {
  const [config, setConfig] = useState<AIConfig>(() => loadConfig());
  const [showSettings, setShowSettings] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  const [session, setSession] = useState<SessionState>({
    isActive: false,
    mode: AppMode.DAILY,
    startTime: null,
  });
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [assessment, setAssessment] = useState<SessionAssessment>({ ...INITIAL_ASSESSMENT });
  const [hasAssessmentData, setHasAssessmentData] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showAssessment, setShowAssessment] = useState(true);
  const [inputText, setInputText] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [autoListen, setAutoListen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('fluentdev-auto-listen') !== 'false';
    }
    return true;
  });
  const [isListening, setIsListening] = useState(false);

  // Refs that async callbacks read to avoid stale closures.
  const configRef = useRef(config);
  const transcriptionsRef = useRef<TranscriptionEntry[]>([]);
  const activeRef = useRef(false);
  const modeRef = useRef<AppMode>(AppMode.DAILY);
  const processingRef = useRef(false);
  const speakingRef = useRef(false);
  const customTopicRef = useRef('');
  const pendingTextRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionStartedRef = useRef(false);
  const autoListenRef = useRef(autoListen);

  useEffect(() => {
    configRef.current = config;
    latestConfig = config;
  }, [config]);

  useEffect(() => {
    transcriptionsRef.current = transcriptions;
  }, [transcriptions]);

  useEffect(() => {
    customTopicRef.current = customTopic;
  }, [customTopic]);

  useEffect(() => {
    autoListenRef.current = autoListen;
    try {
      window.localStorage.setItem('fluentdev-auto-listen', autoListen ? 'true' : 'false');
    } catch (e) {
      /* ignore */
    }
  }, [autoListen]);

  useEffect(() => {
    let interval: any;
    if (session.isActive && session.startTime) {
      interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - session.startTime!) / 1000));
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [session.isActive, session.startTime]);

  // --- Speech recognition helpers (browser STT) ---

  const startRecognition = () => {
    const rec = recognitionRef.current;
    if (!rec || recognitionStartedRef.current) return;
    try {
      rec.start();
      recognitionStartedRef.current = true;
      setIsListening(true);
    } catch (e) {
      console.error('Failed to start recognition', e);
    }
  };

  const stopRecognition = () => {
    const rec = recognitionRef.current;
    if (rec && recognitionStartedRef.current) {
      try {
        rec.stop();
      } catch (e) {
        /* ignore */
      }
    }
    recognitionStartedRef.current = false;
    setIsListening(false);
  };

  // Restart browser listening once the coach has finished speaking (and no other
  // work is pending). Without this, the user could only speak once per session —
  // recognition was never resumed after the first reply. In manual mode
  // (autoListen = false) it does nothing — the user taps "Continue" instead.
  const resumeListening = () => {
    if (!autoListenRef.current) return;
    if (
      activeRef.current &&
      modeRef.current !== AppMode.TRANSLATE &&
      configRef.current.sttEngine === 'browser' &&
      !processingRef.current &&
      !speakingRef.current
    ) {
      startRecognition();
    }
  };

  // --- Core: process a user utterance (STT result or typed text) ---

  const systemPrompt = (mode: AppMode) =>
    SYSTEM_INSTRUCTION +
    `\n\nCURRENT MODE: ${mode}` +
    (mode === AppMode.CUSTOM && customTopicRef.current.trim()
      ? `\nTOPIC TO FOCUS ON: ${customTopicRef.current.trim()}`
      : '');

  const parseAssessmentBlock = (content: string): Partial<SessionAssessment> => {
    const out: Partial<SessionAssessment> = {};
    content.split('\n').forEach(line => {
      const [key, val] = line.split(':').map(s => s.trim());
      if (!key || !val) return;
      const score = parseInt(val);
      if (isNaN(score)) return;
      const k = key.toLowerCase();
      if (k.includes('fluency')) out.fluency = score;
      if (k.includes('listening')) out.listening = score;
      if (k.includes('reflex')) out.reflexing = score;
      if (k.includes('sentence flexibility')) out.sentenceFlexibility = score;
      if (k.includes('vocabulary flexibility')) out.vocabularyFlexibility = score;
      if (k.includes('intonation')) out.intonation = score;
      if (k.includes('linking')) out.linking = score;
      if (k.includes('final sound')) out.finalSound = score;
      if (k.includes('stress')) out.stress = score;
      if (k.includes('vocabulary point')) out.vocabularyPoints = score;
      if (k.includes('confidence')) out.confidenceLevel = score;
    });
    return out;
  };

  const speakText = async (text: string) => {
    const clean = text
      .replace(/\[Correction\][\s\S]*?\[\/Correction\]/g, '')
      .replace(/\[Assessment\][\s\S]*?\[\/Assessment\]/g, '')
      .replace(/\[Insight\][\s\S]*?\[\/Insight\]/g, '')
      .trim();
    if (!clean) return;

    if (configRef.current.ttsEngine === 'omniroute') {
      setIsSpeaking(true);
      speakingRef.current = true;
      try {
        const blob = await speech(configRef.current, clean);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setIsSpeaking(false);
          speakingRef.current = false;
          resumeListening();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setIsSpeaking(false);
          speakingRef.current = false;
          resumeListening();
        };
        await audio.play();
      } catch (e) {
        console.error('TTS error', e);
        setIsSpeaking(false);
        speakingRef.current = false;
        resumeListening();
      }
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'en-US';
      u.rate = 1;
      u.pitch = 1;
      u.onstart = () => {
        setIsSpeaking(true);
        speakingRef.current = true;
      };
      u.onend = () => {
        setIsSpeaking(false);
        speakingRef.current = false;
        resumeListening();
      };
      u.onerror = () => {
        setIsSpeaking(false);
        speakingRef.current = false;
        resumeListening();
      };
      window.speechSynthesis.speak(u);

      // Fallback: Chrome sometimes fails to fire onend/onerror (known quirk with
      // cancel()-then-speak). If the synthesizer goes quiet but we still think we
      // are speaking, force the resume so listening restarts.
      const watchdog = () => {
        if (speakingRef.current && 'speechSynthesis' in window) {
          if (!window.speechSynthesis.speaking) {
            setIsSpeaking(false);
            speakingRef.current = false;
            resumeListening();
            return;
          }
          setTimeout(watchdog, 200);
        }
      };
      setTimeout(watchdog, 200);
    }
  };

  const finalizeModelTurn = (modelId: string, full: string) => {
    // Extract natural phrasing suggestion for the last user message.
    let suggestion: string | undefined;
    const correctionMatch = full.match(/Alternative:\s*(.*)(?:\n|\[\/Correction\]|$)/i);
    if (correctionMatch) {
      suggestion = correctionMatch[1].trim().replace(/^"|"$/g, '');
    } else {
      const suggestionMatch = full.match(/(?:Better alternative|Alternative|Try saying):\s*(.*)(?:\n|$)/i);
      suggestion = suggestionMatch ? suggestionMatch[1].trim() : undefined;
    }

    // Parse [Assessment] block into dashboard scores.
    const assessmentMatch = full.match(/\[Assessment\]([\s\S]*?)\[\/Assessment\]/);
    if (assessmentMatch) {
      const newAssessment = parseAssessmentBlock(assessmentMatch[1]);
      setAssessment(prev => ({ ...prev, ...newAssessment }));
      setHasAssessmentData(true);
    }

    // Parse [Insight] block into the Coach Insight panel (AI-written feedback).
    const insightMatch = full.match(/\[Insight\]([\s\S]*?)\[\/Insight\]/);
    if (insightMatch && insightMatch[1].trim()) {
      const insight = insightMatch[1].trim();
      setAssessment(prev => ({ ...prev, insight }));
    }

    if (suggestion) {
      setTranscriptions(prev => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === 'user' && !copy[i].suggestion) {
            copy[i] = { ...copy[i], suggestion };
            break;
          }
        }
        return copy;
      });
    }

    if (modeRef.current !== AppMode.TRANSLATE) speakText(full);
  };

  const processUserText = async (raw: string) => {
    const text = (raw || '').trim();
    if (!text) return;
    if (!activeRef.current) return;

    // If a previous turn is still running, queue the new text.
    if (processingRef.current) {
      pendingTextRef.current = pendingTextRef.current ? `${pendingTextRef.current} ${text}` : text;
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);
    stopRecognition();

    // Add the user message (also append it to the history we send to the model).
    setTranscriptions(prev => [...prev, { id: uid(), role: 'user', text, timestamp: Date.now() }]);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(modeRef.current) },
      ...transcriptionsRef.current.map(t => ({
        role: t.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: t.text,
      })),
      { role: 'user', content: text },
    ];

    const modelId = uid();
    setTranscriptions(prev => [...prev, { id: modelId, role: 'model', text: '', timestamp: Date.now() }]);

    let full = '';
    try {
      full = await chatStream(configRef.current, messages, delta => {
        setTranscriptions(prev => prev.map(e => (e.id === modelId ? { ...e, text: e.text + delta } : e)));
      });
    } catch (err: any) {
      console.error('Chat error', err);
      setTranscriptions(prev =>
        prev.map(e => (e.id === modelId ? { ...e, text: `⚠️ ${err?.message || 'Connection failed'}` } : e)),
      );
    }

    finalizeModelTurn(modelId, full);

    processingRef.current = false;
    setIsProcessing(false);

    // Resume listening if a previous user turn was queued, or restart recognition.
    if (pendingTextRef.current) {
      const queued = pendingTextRef.current;
      pendingTextRef.current = '';
      processUserText(queued);
      return;
    }
    if (activeRef.current && modeRef.current !== AppMode.TRANSLATE && configRef.current.sttEngine === 'browser') {
      setTimeout(() => resumeListening(), 300);
    }
  };

  const processUserTextRef = useRef(processUserText);
  useEffect(() => {
    processUserTextRef.current = processUserText;
  });

  // --- Recording (push-to-talk, used when STT engine is Gateway) ---

  const startRecording = () => {
    if (!streamRef.current || isRecording) return;
    try {
      const recorder = new MediaRecorder(streamRef.current);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setIsRecording(false);
        if (blob.size > 0 && activeRef.current) {
          setIsProcessing(true);
          try {
            const text = await transcribe(configRef.current, blob);
            if (text.trim()) processUserTextRef.current(text);
          } catch (err: any) {
            console.error('STT error', err);
            setStartError(`Speech-to-text failed: ${err?.message || err}`);
          }
          setIsProcessing(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      console.error('Failed to start recording', e);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  // --- Session lifecycle ---

  const stopSession = () => {
    stopRecognition();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch (e) {
        /* ignore */
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    setSession(prev => ({ ...prev, isActive: false }));
    activeRef.current = false;
    setIsConnecting(false);
    setIsRecording(false);
    setIsProcessing(false);
    setIsSpeaking(false);
    processingRef.current = false;
    speakingRef.current = false;
    pendingTextRef.current = '';
    setInputText('');
  };

  const setupRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setStartError('Web Speech API is not supported in this browser. Use Chrome/Edge, or switch STT to Gateway in Settings.');
      return;
    }
    try {
      const rec = new SR();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) transcript += res[0]?.transcript || '';
        }
        if (transcript.trim()) processUserTextRef.current(transcript);
      };
      rec.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setStartError('Microphone not allowed for speech recognition. Check browser permissions.');
          stopSession();
        }
      };
      rec.onstart = () => {
        setIsListening(true);
      };
      rec.onend = () => {
        recognitionStartedRef.current = false;
        setIsListening(false);
        if (activeRef.current && !processingRef.current && !speakingRef.current && configRef.current.sttEngine === 'browser') {
          setTimeout(() => resumeListening(), 300);
        }
      };
      recognitionRef.current = rec;
      startRecognition();
    } catch (e) {
      console.error('Failed to init speech recognition', e);
    }
  };

  const startSession = async (mode: AppMode) => {
    if (activeRef.current) stopSession();
    setIsConnecting(true);
    setStartError(null);
    setTranscriptions([]);
    setAssessment({ ...INITIAL_ASSESSMENT });
    setHasAssessmentData(false);
    setDuration(0);

    try {
      if (mode !== AppMode.TRANSLATE) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        streamRef.current = stream;
      }
      setSession({ isActive: true, mode, startTime: Date.now() });
      activeRef.current = true;
      modeRef.current = mode;

      if (mode !== AppMode.TRANSLATE && configRef.current.sttEngine === 'browser') {
        setupRecognition();
      }
    } catch (err: any) {
      console.error('Failed to start session:', err);
      setStartError(
        err?.name === 'NotAllowedError' || err?.name === 'NotFoundError'
          ? 'Microphone access was denied or unavailable. Check browser permissions and try again.'
          : `Failed to start: ${err?.message || err}`,
      );
      activeRef.current = false;
    }
    setIsConnecting(false);
  };

  const changeMode = (newMode: AppMode) => {
    if (session.isActive) {
      if (session.mode === newMode) return;
      setTranscriptions([]);
      startSession(newMode);
    } else {
      // Inactive: just select the mode; user clicks Start to begin.
      setSession(prev => ({ ...prev, mode: newMode }));
    }
  };

  const sendTextMessage = (text: string) => {
    const t = text.trim();
    if (!t || !activeRef.current) return;
    setInputText('');
    processUserTextRef.current(t);
  };

  const finishAndAssess = async () => {
    if (!activeRef.current) return;
    stopRecognition();
    processingRef.current = true;
    setIsProcessing(true);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(modeRef.current) },
      ...transcriptionsRef.current.map(t => ({
        role: t.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: t.text,
      })),
      {
        role: 'user',
        content:
          'The student has ended the session. Please provide a final assessment using the [Assessment] block, briefly summarize strengths and areas to improve, then say goodbye.',
      },
    ];

    const modelId = uid();
    setTranscriptions(prev => [...prev, { id: modelId, role: 'model', text: '', timestamp: Date.now() }]);

    let full = '';
    try {
      full = await chatStream(configRef.current, messages, delta => {
        setTranscriptions(prev => prev.map(e => (e.id === modelId ? { ...e, text: e.text + delta } : e)));
      });
    } catch (err: any) {
      console.error('Assessment error', err);
      setTranscriptions(prev =>
        prev.map(e => (e.id === modelId ? { ...e, text: `⚠️ ${err?.message || 'Connection failed'}` } : e)),
      );
    }
    finalizeModelTurn(modelId, full);

    processingRef.current = false;
    setIsProcessing(false);
    setTimeout(() => stopSession(), 1200);
  };

  // --- Render helpers ---

  const renderMessageText = (text: string) => {
    const correctionRegex = /\[Correction\]([\s\S]*?)\[\/Correction\]/g;
    const assessmentRegex = /\[Assessment\]([\s\S]*?)\[\/Assessment\]/g;
    const insightRegex = /\[Insight\]([\s\S]*?)\[\/Insight\]/g;

    let cleanText = text.replace(assessmentRegex, '').replace(insightRegex, '').trim();

    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    let match;

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

      const words = part.split(/(\s+)/);
      return words.map((word, idx) => {
        if (word.trim().length === 0) return <span key={`${partIdx}-${idx}`}>{word}</span>;
        const wordMatch = word.match(/^([\w']+)(.*)$/);
        if (wordMatch) {
          const [_, mainWord, punctuation] = wordMatch;
          return (
            <React.Fragment key={`${partIdx}-${idx}`}>
              <HoverableWord word={mainWord} config={config} />
              {punctuation}
            </React.Fragment>
          );
        }
        return <span key={`${partIdx}-${idx}`}>{word}</span>;
      });
    });
  };

  return (
    <div className={`flex flex-col h-screen overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} selection:bg-blue-100 selection:text-blue-900`}>
      <Header
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        showSidebar={showSidebar}
        toggleSidebar={() => setShowSidebar(!showSidebar)}
        showAssessment={showAssessment}
        toggleAssessment={() => setShowAssessment(!showAssessment)}
        onOpenSettings={() => setShowSettings(true)}
      />
      <SelectionTranslator config={config} />

      <main className="flex-1 flex flex-col md:flex-row max-w-[1600px] mx-auto w-full p-4 md:p-6 gap-6 h-[calc(100vh-64px)] overflow-hidden">

        {/* Navigation Sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.nav
              initial={{ width: 0, opacity: 0, x: -20 }}
              animate={{ width: 300, opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: -20 }}
              className="hidden md:flex flex-col space-y-2 overflow-y-auto pr-2 shrink-0"
            >
              <div className="mb-4">
                <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-4 mb-2">Practice Modes</h2>
                <div className="space-y-1">
                  {Object.values(AppMode).map(m => (
                    <SidebarItem key={m} mode={m} active={session.mode === m} onClick={changeMode} />
                  ))}
                </div>
              </div>

              <div className="mt-auto bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-2xl p-4">
                <h3 className="font-bold text-blue-900 dark:text-blue-300 text-sm mb-1">Coach Pro Tip</h3>
                <p className="text-blue-700 dark:text-blue-400 text-xs leading-relaxed">
                  "Try to use transition words like 'Furthermore' or 'On the other hand' to sound more professional."
                </p>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>

        {/* Chat / Interaction Area */}
        <section className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth">
            {!session.isActive && !isConnecting && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-6">
                  <span className="text-4xl">{session.mode === AppMode.TRANSLATE ? '⌨️' : '🎙️'}</span>
                </div>
                <h2 className="text-2xl font-bold mb-2 dark:text-white">
                  {session.mode === AppMode.TRANSLATE ? 'Ready to Translate?' : 'Ready to Speak English?'}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mb-6">
                  {session.mode === AppMode.TRANSLATE
                    ? 'Type your Vietnamese sentences and the AI will suggest natural English phrasing.'
                    : 'Choose a session mode and start practicing naturally with your AI Coach.'}
                </p>

                {session.mode === AppMode.CUSTOM && (
                  <div className="w-full mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-left">What topic do you want to practice?</label>
                    <input
                      type="text"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder="e.g., Job Interview, Travel to Japan, Ordering Coffee..."
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                  </div>
                )}

                {startError && (
                  <div className="w-full mb-4 text-left text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
                    ⚠️ {startError}
                  </div>
                )}

                <button
                  onClick={() => startSession(session.mode)}
                  disabled={session.mode === AppMode.CUSTOM && !customTopic.trim()}
                  className={`bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-bold transition-all transform hover:scale-105 shadow-lg ${session.mode === AppMode.CUSTOM && !customTopic.trim() ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                >
                  Start Session Now
                </button>
                <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">💡 Tip: Hover over any word to see its translation!</p>
              </div>
            )}

            {isConnecting && (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 rounded-full animate-spin"></div>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-blue-600">AI</span>
                </div>
                <p className="mt-4 text-slate-500 dark:text-slate-400 font-medium">Connecting to your coach...</p>
              </div>
            )}

            {transcriptions.map(t => (
              <div
                key={t.id}
                className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}
              >
                <div
                  className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl relative group/msg ${
                    t.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none shadow-sm'
                  }`}
                >
                  {t.role === 'model' && (
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">Coach</div>
                  )}
                  <div className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                    {t.text === '' && t.role === 'model' ? (
                      <span className="inline-flex items-center gap-2 text-slate-400">
                        <Loader2 size={14} className="animate-spin" /> thinking...
                      </span>
                    ) : (
                      renderMessageText(t.text)
                    )}
                  </div>

                  {/* Full Message Translation Button */}
                  <div className={`absolute top-2 right-2 opacity-0 group-hover/msg:opacity-100 transition-opacity flex gap-1`}>
                    <button
                      onClick={async () => {
                        if (t.translation) {
                          setTranscriptions(prev => prev.map(item => (item.id === t.id ? { ...item, translation: undefined } : item)));
                          return;
                        }
                        const result = await translatePhrase(config, t.text);
                        setTranscriptions(prev => prev.map(item => (item.id === t.id ? { ...item, translation: result || undefined } : item)));
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${t.role === 'user' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 shadow-sm'}`}
                      title="Translate full message"
                    >
                      <Languages size={14} />
                    </button>
                  </div>

                  {t.translation && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className={`mt-3 pt-3 border-t ${t.role === 'user' ? 'border-white/10 text-blue-100' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'} text-xs italic leading-relaxed`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 font-bold uppercase tracking-tighter opacity-70">
                        <Sparkles size={10} />
                        <span>Vietnamese Translation</span>
                      </div>
                      {t.translation}
                    </motion.div>
                  )}
                </div>

                {t.role === 'user' && t.suggestion && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-500 max-w-[80%] flex flex-col items-end">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 rounded-2xl rounded-tr-none py-2 px-4 text-xs md:text-sm shadow-sm">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <span className="text-xs">💡</span>
                        <span>Natural Phrasing</span>
                      </div>
                      <p className="italic font-medium leading-relaxed">
                        {renderMessageText(`"${t.suggestion}"`)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Persistent Control Bar */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t dark:border-slate-800 flex flex-col gap-4 transition-colors">
            {session.isActive && session.mode === AppMode.TRANSLATE && (
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendTextMessage(inputText);
                    }
                  }}
                  placeholder="Nhập câu tiếng Việt bạn muốn dịch..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-2 dark:text-white"
                />
                <button
                  onClick={() => sendTextMessage(inputText)}
                  disabled={!inputText.trim()}
                  className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={stopSession}
                  className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-500 transition-colors"
                  title="Stop Session"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {session.mode !== AppMode.TRANSLATE && (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="relative flex items-center justify-center">
                    <div className={`w-4 h-4 rounded-full ${session.isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
                    {session.isActive && (
                      <div className="absolute w-8 h-8 bg-green-500/20 rounded-full animate-ping"></div>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {session.isActive
                        ? isProcessing
                          ? 'Coach is thinking...'
                          : isSpeaking
                          ? 'Coach is speaking...'
                          : isListening
                          ? 'Session Active'
                          : 'Listening paused'
                        : 'Ready to Start'}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                      {session.isActive ? `Mode: ${MODE_INFO[session.mode].title}` : 'Select a mode to begin'}
                    </span>
                  </div>

                  {/* Auto-listen toggle (browser STT): ON = keep talking freely, OFF = tap Continue after reading the reply */}
                  {config.sttEngine === 'browser' && (
                    <button
                      onClick={() => {
                        const next = !autoListen;
                        setAutoListen(next);
                        if (next) {
                          if (session.isActive && !isProcessing && !isSpeaking) startRecognition();
                        } else {
                          stopRecognition();
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        autoListen
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30 text-blue-600 dark:text-blue-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                      }`}
                      title={autoListen ? 'Auto-listen ON — talk freely after each reply' : 'Auto-listen OFF — tap Continue after reading the coach reply'}
                    >
                      <span className={`relative inline-block w-9 h-5 rounded-full transition-colors ${autoListen ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${autoListen ? 'left-[18px]' : 'left-0.5'}`}></span>
                      </span>
                      Auto-listen
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-4">
                  {/* Listening indicator (browser STT, only while recognition is actually running) */}
                  {session.isActive && config.sttEngine === 'browser' && isListening && !isProcessing && !isSpeaking && (
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className={`w-1 h-3 rounded-full bg-blue-500 animate-bounce`} style={{ animationDelay: `${i * 0.1}s` }}></div>
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tight">Listening</span>
                    </div>
                  )}

                  {/* Continue button (manual mode): user reads the reply, then taps to speak again */}
                  {session.isActive && config.sttEngine === 'browser' && !autoListen && !isListening && !isProcessing && !isSpeaking && (
                    <button
                      onClick={() => startRecognition()}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all animate-in fade-in"
                    >
                      <Mic size={16} />
                      Continue
                    </button>
                  )}

                  {/* Push-to-talk (OmniRoute STT) */}
                  {session.isActive && config.sttEngine === 'omniroute' && (
                    <button
                      onPointerDown={startRecording}
                      onPointerUp={stopRecording}
                      onPointerLeave={stopRecording}
                      onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                      onTouchEnd={stopRecording}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${
                        isRecording
                          ? 'bg-red-500 text-white border-red-500 shadow-red-200 shadow-md'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      title="Hold to speak"
                    >
                      <Mic size={16} className={isRecording ? 'animate-pulse' : ''} />
                      {isRecording ? 'Recording... release to send' : 'Hold to Speak'}
                    </button>
                  )}

                  {/* One action while active: Finish & Assess. While idle: Start. */}
                  {session.isActive ? (
                    <button
                      onClick={finishAndAssess}
                      className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-md flex items-center gap-2"
                    >
                      <span>🏁</span>
                      Finish & Assess
                    </button>
                  ) : (
                    <button
                      onClick={() => startSession(session.mode)}
                      className="w-14 h-14 flex items-center justify-center rounded-full transition-all group relative bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 shadow-xl"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                        Start Speaking
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Assessment Panel (Right Side) */}
        <AnimatePresence>
          {showAssessment && (
            <motion.aside
              initial={{ width: 0, opacity: 0, x: 20 }}
              animate={{ width: 450, opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: 20 }}
              className="hidden lg:flex flex-col gap-6 min-h-0 overflow-y-auto pr-2"
            >
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm flex flex-col h-full transition-colors">
                <h3 className="text-lg font-bold mb-8 flex items-center gap-2 text-slate-800 dark:text-white">
                  <span className="text-[#2D8A82]">📊</span> Session Statistics
                </h3>

                <div className="grid grid-cols-3 gap-3 mb-8">
                  <SessionStat
                    icon="⏱️"
                    label="Duration"
                    value={`${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`}
                  />
                  <SessionStat
                    icon="📚"
                    label="Vocab"
                    value={assessment.vocabularyPoints}
                    unit=" pts"
                  />
                  <SessionStat
                    icon="💪"
                    label="Confidence"
                    value={assessment.confidenceLevel}
                    unit="%"
                  />
                </div>

                <h3 className="text-lg font-bold mb-8 flex items-center gap-2 text-slate-800 dark:text-white">
                  <span className="text-blue-600">🎯</span> Comprehensive Assessment
                </h3>

                <div className="space-y-4 flex-1">
                  {!hasAssessmentData ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-100 dark:border-slate-700">
                        <Search className="text-slate-300 dark:text-slate-600" size={24} />
                      </div>
                      <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight mb-1">Waiting for analysis</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                        Start speaking with your coach. Your performance will be analyzed and displayed here in real-time.
                      </p>
                    </div>
                  ) : (
                    <>
                      <AssessmentBar label="Fluency" value={assessment.fluency} />
                      <AssessmentBar label="Listening" value={assessment.listening} />
                      <AssessmentBar label="Reflexing" value={assessment.reflexing} />
                      <AssessmentBar label="Sentence Flexibility" value={assessment.sentenceFlexibility} />
                      <AssessmentBar label="Vocabulary Flexibility" value={assessment.vocabularyFlexibility} />
                      <AssessmentBar label="Intonation" value={assessment.intonation} />
                      <AssessmentBar label="Linking" value={assessment.linking} />
                      <AssessmentBar label="Final Sound" value={assessment.finalSound} />
                      <AssessmentBar label="Stress" value={assessment.stress} />
                    </>
                  )}
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Coach Insight</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                      {!hasAssessmentData
                        ? "Your coach will provide personalized insights here once the session begins."
                        : assessment.insight || deriveInsight(assessment)}
                    </p>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {showSettings && (
        <SettingsModal initial={config} onClose={() => setShowSettings(false)} onSaved={(cfg) => setConfig(cfg)} />
      )}
    </div>
  );
};

export default App;
