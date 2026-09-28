import React, { useState, useEffect, useRef } from 'react';
import { AppMode, TranscriptionEntry, SessionState, SpeechRecognition } from './types';
import { SYSTEM_INSTRUCTION, MODE_INFO, DIFFICULTY_PROMPT, PERSONA_PROMPT } from './constants';
import { MODE_CONFIGS, MODE_PROMPT_SNIPPET } from './modes';
import {
  AIConfig,
  ChatMessage,
  loadConfig,
  chatStream,
  translatePhrase,
  transcribe,
  speech,
} from './utils/api';
import { SettingsModal } from './components/SettingsModal';
import { LibraryPanel } from './components/LibraryPanel';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SelectionTranslator } from './components/SelectionTranslator';
import { HoverableWord } from './components/HoverableWord';
import { CorrectionCard } from './components/CorrectionCard';
import { AssessmentPanel } from './components/AssessmentPanel';
import { AIConfigProvider } from './context/AIConfigContext';
import { INITIAL_ASSESSMENT, parseAssessmentBlock } from './utils/assessment';
import { analyzeSpeech, avgSkill, xpForSession } from './utils/speechMetrics';
import { isBrowserSTTSupported } from './utils/browser';
import { pickVoiceByURI } from './utils/browser';
import {
  saveSession, addMistake, parseCorrectionBlock, logSessionProgress,
  getStreak, totalXP, transcriptToMarkdown, downloadText,
} from './utils/storage';
import { Languages, Sparkles, Mic, X, ChevronRight, Loader2, Square, RotateCcw, Copy, Download, TriangleAlert, PanelLeft, PanelRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

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
    setIsDarkMode((prev) => {
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
  const [assessment, setAssessment] = useState({ ...INITIAL_ASSESSMENT });
  const [hasAssessmentData, setHasAssessmentData] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showAssessment, setShowAssessment] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [inputText, setInputText] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [scenarioId, setScenarioId] = useState<string>('weekend');
  const [showPhrases, setShowPhrases] = useState(false);
  const [autoListen, setAutoListen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('fluentdev-auto-listen') !== 'false';
    }
    return true;
  });
  const [isListening, setIsListening] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [browserSTT] = useState(() => isBrowserSTTSupported());
  // speech metrics + gamification
  const [avgWpm, setAvgWpm] = useState(0);
  const [fillerTotal, setFillerTotal] = useState(0);
  const [userTurns, setUserTurns] = useState(0);
  const [streak, setStreak] = useState(() => getStreak());
  const [xp, setXp] = useState(() => totalXP());
  const [copiedAll, setCopiedAll] = useState(false);

  // Refs that async callbacks read to avoid stale closures.
  const configRef = useRef(config);
  const transcriptionsRef = useRef<TranscriptionEntry[]>([]);
  const activeRef = useRef(false);
  const modeRef = useRef<AppMode>(AppMode.DAILY);
  const processingRef = useRef(false);
  const speakingRef = useRef(false);
  const customTopicRef = useRef('');
  const scenarioRef = useRef('weekend');
  const pendingTextRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionStartedRef = useRef(false);
  const autoListenRef = useRef(autoListen);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastCoachTextRef = useRef('');
  const turnStartRef = useRef<number>(Date.now());
  const wpmSamplesRef = useRef<number[]>([]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    transcriptionsRef.current = transcriptions;
  }, [transcriptions]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcriptions]);

  useEffect(() => {
    customTopicRef.current = customTopic;
  }, [customTopic]);

  useEffect(() => {
    scenarioRef.current = scenarioId;
  }, [scenarioId]);

  useEffect(() => {
    autoListenRef.current = autoListen;
    try {
      window.localStorage.setItem('fluentdev-auto-listen', autoListen ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [autoListen]);

  useEffect(() => {
    if (!session.isActive || !session.startTime) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDuration(0);
      return;
    }
    const start = session.startTime;
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [session.isActive, session.startTime]);

  // --- Speech recognition helpers ---
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
      } catch {
        /* ignore */
      }
    }
    recognitionStartedRef.current = false;
    setIsListening(false);
  };

  const resumeListening = () => {
    if (!autoListenRef.current) return;
    if (
      activeRef.current &&
      modeRef.current !== AppMode.TRANSLATE &&
      configRef.current.sttEngine === 'browser' &&
      !processingRef.current &&
      !speakingRef.current
    ) {
      turnStartRef.current = Date.now();
      startRecognition();
    }
  };

  const systemPrompt = (mode: AppMode) => {
    const cfg = configRef.current;
    if (cfg.systemPromptOverride?.trim()) return cfg.systemPromptOverride;
    const extra = `\n\nSTUDENT LEVEL: ${DIFFICULTY_PROMPT[cfg.difficulty ?? 'intermediate']}\nCOACH TONE: ${PERSONA_PROMPT[cfg.persona ?? 'encouraging']}`;
    const modeSnippet = MODE_PROMPT_SNIPPET[mode] ?? '';
    const scenario = MODE_CONFIGS[mode]?.scenarios?.find((s) => s.id === scenarioRef.current);
    const scenarioLine = scenario ? `\nSCENARIO: ${scenario.label} — ${scenario.setup}` : '';
    const customLine =
      mode === AppMode.CUSTOM && customTopicRef.current.trim()
        ? `\nLESSON TOPIC (CLASSROOM — STRICT, DO NOT DIGRESS): ${customTopicRef.current.trim()}\nYou are the TEACHER for this lesson. Open by confirming the topic + asking ONE level/goal check, then loop: teach ONE micro-point → 2 examples → ONE drill task → detailed correction. Stay 100% on this topic.`
        : '';
    return (
      SYSTEM_INSTRUCTION +
      extra +
      `\n\nCURRENT MODE: ${mode}\nMODE BEHAVIOR: ${modeSnippet}` +
      scenarioLine +
      customLine
    );
  };

  const stopSpeaking = () => {
    // barge-in: interrupt coach immediately
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); } catch { /* ignore */ }
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    speakingRef.current = false;
    resumeListening();
  };

  const replayLast = () => {
    if (lastCoachTextRef.current) void speakText(lastCoachTextRef.current);
  };

  const speakText = async (text: string) => {
    const clean = text
      .replace(/\[Correction\][\s\S]*?\[\/Correction\]/g, '')
      .replace(/\[Assessment\][\s\S]*?\[\/Assessment\]/g, '')
      .replace(/\[Insight\][\s\S]*?\[\/Insight\]/g, '')
      .trim();
    if (!clean) return;
    lastCoachTextRef.current = clean;

    if (configRef.current.ttsEngine === 'custom') {
      setIsSpeaking(true);
      speakingRef.current = true;
      let url: string | null = null;
      try {
        const blob = await speech(configRef.current, clean);
        url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            if (url) URL.revokeObjectURL(url);
            currentAudioRef.current = null;
            setIsSpeaking(false);
            speakingRef.current = false;
            resumeListening();
            resolve();
          };
          audio.onerror = () => {
            if (url) URL.revokeObjectURL(url);
            currentAudioRef.current = null;
            setIsSpeaking(false);
            speakingRef.current = false;
            resumeListening();
            reject(new Error('Audio playback failed'));
          };
          audio.play().catch(reject);
        });
      } catch (e) {
        if (url) URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        console.error('TTS error', e);
        setIsSpeaking(false);
        speakingRef.current = false;
        resumeListening();
      }
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'en-US';
      u.rate = configRef.current.ttsRate ?? 1;
      u.pitch = configRef.current.ttsPitch ?? 1;
      const v = pickVoiceByURI(configRef.current.ttsVoiceURI);
      if (v) u.voice = v;
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
    // auto-save every [Correction] block into mistake notebook
    const correctionBlocks = full.match(/\[Correction\]([\s\S]*?)\[\/Correction\]/g);
    if (correctionBlocks) {
      for (const block of correctionBlocks) {
        const inner = block.replace(/\[Correction\]|\[\/Correction\]/g, '');
        const parsed = parseCorrectionBlock(inner);
        if (parsed) {
          try { addMistake({ ...parsed, mode: modeRef.current }); } catch { /* ignore */ }
        }
      }
    }
    let suggestion: string | undefined;
    const correctionMatch = full.match(/Alternative:\s*(.*)(?:\n|\[\/Correction\]|$)/i);
    if (correctionMatch) {
      suggestion = correctionMatch[1].trim().replace(/^"|"$/g, '');
    } else {
      const suggestionMatch = full.match(/(?:Better alternative|Alternative|Try saying):\s*(.*)(?:\n|$)/i);
      suggestion = suggestionMatch ? suggestionMatch[1].trim() : undefined;
    }

    const assessmentMatch = full.match(/\[Assessment\]([\s\S]*?)\[\/Assessment\]/);
    if (assessmentMatch) {
      const newAssessment = parseAssessmentBlock(assessmentMatch[1]);
      setAssessment((prev) => ({ ...prev, ...newAssessment }));
      setHasAssessmentData(true);
    }

    const insightMatch = full.match(/\[Insight\]([\s\S]*?)\[\/Insight\]/);
    if (insightMatch && insightMatch[1].trim()) {
      const insight = insightMatch[1].trim();
      setAssessment((prev) => ({ ...prev, insight }));
    }

    if (suggestion) {
      setTranscriptions((prev) => {
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

    if (modeRef.current !== AppMode.TRANSLATE) void speakText(full);
  };

  const processUserText = async (raw: string) => {
    const text = (raw || '').trim();
    if (!text) return;
    if (!activeRef.current) return;

    if (processingRef.current) {
      pendingTextRef.current = pendingTextRef.current ? `${pendingTextRef.current} ${text}` : text;
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);
    stopRecognition();

    // real speech metrics for this user turn
    const elapsed = Math.max(1, (Date.now() - turnStartRef.current) / 1000);
    const m = analyzeSpeech(text, Math.min(elapsed, 120));
    wpmSamplesRef.current = [...wpmSamplesRef.current.slice(-19), m.wpm].filter((v) => v > 0);
    const avg = wpmSamplesRef.current.length ? Math.round(wpmSamplesRef.current.reduce((a, b) => a + b, 0) / wpmSamplesRef.current.length) : m.wpm;
    setAvgWpm(avg);
    setFillerTotal((v) => v + m.fillerCount);
    setUserTurns((v) => v + 1);
    turnStartRef.current = Date.now();

    setTranscriptions((prev) => [...prev, { id: uid(), role: 'user', text, timestamp: Date.now(), wpm: m.wpm, fillerCount: m.fillerCount }]);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(modeRef.current) },
      ...transcriptionsRef.current.map((t) => ({
        role: (t.role === 'user' ? 'user' : 'assistant') as ChatMessage['role'],
        content: t.text,
      })),
      { role: 'user', content: text },
    ];

    const modelId = uid();
    setTranscriptions((prev) => [...prev, { id: modelId, role: 'model', text: '', timestamp: Date.now() }]);

    const controller = new AbortController();
    abortRef.current = controller;

    let full = '';
    try {
      full = await chatStream(configRef.current, messages, (delta) => {
        setTranscriptions((prev) => prev.map((e) => (e.id === modelId ? { ...e, text: e.text + delta } : e)));
      }, controller.signal);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setTranscriptions((prev) => prev.filter((e) => e.id !== modelId));
        return;
      }
      const msg = err instanceof Error ? err.message : 'Connection failed';
      console.error('Chat error', err);
      setTranscriptions((prev) =>
        prev.map((e) => (e.id === modelId ? { ...e, text: `⚠️ ${msg}` } : e))
      );
    } finally {
      abortRef.current = null;
    }

    finalizeModelTurn(modelId, full);

    processingRef.current = false;
    setIsProcessing(false);

    if (pendingTextRef.current) {
      const queued = pendingTextRef.current;
      pendingTextRef.current = '';
      void processUserText(queued);
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

  const startRecording = () => {
    if (!streamRef.current || isRecording) return;
    try {
      const recorder = new MediaRecorder(streamRef.current);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setIsRecording(false);
        if (blob.size > 0 && activeRef.current) {
          setIsProcessing(true);
          transcribe(configRef.current, blob)
            .then((txt) => {
              if (txt.trim()) void processUserTextRef.current(txt);
            })
            .catch((err: unknown) => {
              console.error('STT error', err);
              const msg = err instanceof Error ? err.message : String(err);
              setStartError(`Speech-to-text failed: ${msg}`);
            })
            .finally(() => setIsProcessing(false));
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

  const persistSession = (endedTranscriptions?: TranscriptionEntry[]) => {
    try {
      const list = endedTranscriptions ?? transcriptionsRef.current;
      if (list.length < 2) return;
      const startedAt = session.startTime ?? Date.now();
      const endedAt = Date.now();
      const durationSec = Math.max(1, Math.round((endedAt - startedAt) / 1000));
      const corrections = list.filter((t) => t.text.includes('[Correction]')).length;
      const avg = avgSkill(assessment);
      const xpGain = xpForSession(durationSec, userTurns, corrections);
      saveSession({
        id: uid(), mode: modeRef.current, startedAt, endedAt, durationSec,
        turns: userTurns, corrections, avgScore: avg,
        vocabPoints: assessment.vocabularyPoints, confidence: assessment.confidenceLevel,
        transcript: list,
      });
      const { streak: s } = logSessionProgress(durationSec, xpGain);
      setStreak(s);
      setXp(totalXP());
    } catch (e) {
      console.error('persist session failed', e);
    }
  };

  const stopSession = (save = true) => {
    if (save && activeRef.current) persistSession();
    stopRecognition();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    setSession((prev) => ({ ...prev, isActive: false }));
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
        if (transcript.trim()) void processUserTextRef.current(transcript);
      };
      rec.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setStartError('Microphone not allowed for speech recognition. Check browser permissions.');
          stopSession();
        } else if (event.error === 'no-speech' || event.error === 'audio-capture') {
          // transient, will restart via onend
        }
      };
      rec.onstart = () => {
        setIsListening(true);
      };
      rec.onend = () => {
        recognitionStartedRef.current = false;
        setIsListening(false);
        if (activeRef.current && !processingRef.current && !speakingRef.current && configRef.current.sttEngine === 'browser') {
          // Prevent tight loop on repeated errors: backoff 300ms
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
    if (activeRef.current) stopSession(false);
    setIsConnecting(true);
    setStartError(null);
    setTranscriptions([]);
    setAssessment({ ...INITIAL_ASSESSMENT });
    setHasAssessmentData(false);
    setDuration(0);
    setAvgWpm(0);
    setFillerTotal(0);
    setUserTurns(0);
    wpmSamplesRef.current = [];
    turnStartRef.current = Date.now();
    lastCoachTextRef.current = '';

    // Safari/Firefox: no Web Speech -> auto-suggest custom STT instead of hard fail
    if (mode !== AppMode.TRANSLATE && configRef.current.sttEngine === 'browser' && !isBrowserSTTSupported()) {
      setStartError('Trình duyệt này không hỗ trợ Web Speech (Safari iOS / Firefox). Hãy chuyển STT sang Custom Provider trong Settings để dùng Hold-to-Speak, hoặc gõ text bên dưới.');
    }

    try {
      if (mode !== AppMode.TRANSLATE && !(configRef.current.sttEngine === 'browser' && !isBrowserSTTSupported())) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          streamRef.current = stream;
        } catch (micErr) {
          // Translate + text fallback still works without mic (mode already narrowed to non-translate here)
          console.warn('Mic unavailable, continuing with text input', micErr);
          setStartError('Không lấy được micro — bạn vẫn có thể gõ text để học. Kiểm tra quyền micro nếu muốn nói.');
        }
      }
      setSession({ isActive: true, mode, startTime: Date.now() });
      activeRef.current = true;
      modeRef.current = mode;

      if (mode !== AppMode.TRANSLATE && configRef.current.sttEngine === 'browser') {
        setupRecognition();
      }
    } catch (err: unknown) {
      console.error('Failed to start session:', err);
      const e = err as Error & { name?: string };
      setStartError(
        e?.name === 'NotAllowedError' || e?.name === 'NotFoundError'
          ? 'Microphone access was denied or unavailable. Check browser permissions and try again.'
          : `Failed to start: ${e?.message || String(err)}`
      );
      activeRef.current = false;
    }
    setIsConnecting(false);
  };

  const changeMode = (newMode: AppMode) => {
    setIsMobileSidebarOpen(false);
    const def = MODE_CONFIGS[newMode]?.scenarios?.[0]?.id;
    if (def) {
      setScenarioId(def);
      scenarioRef.current = def;
    }
    if (session.isActive) {
      if (session.mode === newMode) return;
      setTranscriptions([]);
      void startSession(newMode);
    } else {
      setSession((prev) => ({ ...prev, mode: newMode }));
    }
  };

  const sendTextMessage = (text: string) => {
    const t = text.trim();
    if (!t || !activeRef.current) return;
    setInputText('');
    void processUserTextRef.current(t);
  };

  const finishAndAssess = async () => {
    if (!activeRef.current) return;
    stopRecognition();
    processingRef.current = true;
    setIsProcessing(true);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(modeRef.current) },
      ...transcriptionsRef.current.map((t) => ({
        role: (t.role === 'user' ? 'user' : 'assistant') as ChatMessage['role'],
        content: t.text,
      })),
      {
        role: 'user',
        content:
          modeRef.current === AppMode.MEETING
            ? 'The meeting is over. Provide [Assessment], then summarise: 3 strengths, 2 things to improve (conciseness + professionalism), plus action-items list from our discussion. Say goodbye.'
            : modeRef.current === AppMode.PRESENTATION
              ? 'The presentation is over. Provide [Assessment], then report: structure score, pace (use WPM if observable), filler words, 1 signposting tip, plus ONE tough Q&A question to practice next. Say goodbye.'
              : modeRef.current === AppMode.CUSTOM
                ? 'The lesson is over. Provide [Assessment], then give a 3-question mini-quiz on the lesson topic for homework plus a 2-sentence recap. Say goodbye.'
                : modeRef.current === AppMode.TRANSLATE
                  ? 'Session over. Provide [Assessment], then list the 3 most useful natural phrasings we learned with 1-line nuance each. Say goodbye.'
                  : 'The student has ended the session. Please provide a final assessment using the [Assessment] block, briefly summarize strengths and areas to improve, then say goodbye.',
      },
    ];

    const modelId = uid();
    setTranscriptions((prev) => [...prev, { id: modelId, role: 'model', text: '', timestamp: Date.now() }]);

    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    try {
      full = await chatStream(configRef.current, messages, (delta) => {
        setTranscriptions((prev) => prev.map((e) => (e.id === modelId ? { ...e, text: e.text + delta } : e)));
      }, controller.signal);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      console.error('Assessment error', err);
      setTranscriptions((prev) =>
        prev.map((e) => (e.id === modelId ? { ...e, text: `⚠️ ${msg}` } : e))
      );
    } finally {
      abortRef.current = null;
    }
    finalizeModelTurn(modelId, full);

    processingRef.current = false;
    setIsProcessing(false);
    setTimeout(() => stopSession(true), 1500);
  };

  const renderMessageText = (text: string) => {
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

      const words = part.split(/(\s+)/);
      return words.map((word, idx) => {
        if (word.trim().length === 0) return <span key={`${partIdx}-${idx}`}>{word}</span>;
        const wordMatch = word.match(/^([\w']+)(.*)$/);
        if (wordMatch) {
          const [, mainWord, punctuation] = wordMatch;
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
    <AIConfigProvider config={config}>
      <div
        className={`flex flex-col h-dvh overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} selection:bg-blue-100 selection:text-blue-900`}
      >
        <Header
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          onOpenSettings={() => setShowSettings(true)}
          onOpenLibrary={() => setShowLibrary(true)}
        />
        <SelectionTranslator config={config} />
        {!browserSTT && (
          <div className="mx-4 md:mx-6 mt-3 flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 rounded-2xl px-4 py-2.5" role="alert">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>Trình duyệt này không hỗ trợ Web Speech (Safari/Firefox). Hãy chuyển STT → Custom Provider trong Settings để dùng nút Hold-to-Speak, hoặc gõ text phía dưới — app vẫn học bình thường.</span>
          </div>
        )}

        <main className="flex-1 flex flex-col md:flex-row max-w-[1600px] mx-auto w-full p-2 sm:p-4 md:p-6 gap-3 md:gap-6 h-[calc(100dvh-56px)] sm:h-[calc(100dvh-64px)] min-h-0 overflow-hidden relative">
          {/* Desktop Sidebar */}
          <AnimatePresence>
            {showSidebar && (
              <motion.nav
                initial={{ width: 0, opacity: 0, x: -20 }}
                animate={{ width: 280, opacity: 1, x: 0 }}
                exit={{ width: 0, opacity: 0, x: -20 }}
                className="hidden md:flex flex-col shrink-0 overflow-hidden bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm"
                aria-label="Desktop practice modes"
              >
                <div className="w-[280px] flex flex-col h-full">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Modes</span>
                    <button
                      onClick={() => setShowSidebar(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                      aria-label="Collapse practice modes"
                      title="Collapse sidebar"
                    >
                      <ChevronsLeft size={16} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    <Sidebar activeMode={session.mode} onChangeMode={changeMode} />
                  </div>
                </div>
              </motion.nav>
            )}
          </AnimatePresence>

          {/* Mobile Drawer */}
          <AnimatePresence>
            {isMobileSidebarOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/40 z-30 md:hidden"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  aria-hidden="true"
                />
                <motion.nav
                  initial={{ x: -300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -300, opacity: 0 }}
                  className="fixed left-0 top-14 sm:top-16 bottom-0 w-[85vw] max-w-[300px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-40 md:hidden p-4 pb-[env(safe-area-inset-bottom)] overflow-y-auto"
                  aria-label="Mobile practice modes"
                >
                  <div className="flex items-center justify-between mb-2 md:hidden">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Practice Modes</span>
                    <button
                      onClick={() => setIsMobileSidebarOpen(false)}
                      className="p-2 -m-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label="Close menu"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <Sidebar activeMode={session.mode} onChangeMode={changeMode} />
                </motion.nav>
              </>
            )}
          </AnimatePresence>

          {/* Chat / Interaction Area */}
          <section className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors min-w-0">
            <div className="flex items-center gap-2 px-2 sm:px-3 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <button
                onClick={() => {
                  if (window.innerWidth < 768) setIsMobileSidebarOpen(true);
                  else setShowSidebar(true);
                }}
                className={`h-9 flex items-center gap-1.5 px-2.5 rounded-xl border text-xs font-bold transition-all ${(showSidebar || isMobileSidebarOpen) ? 'invisible w-0 px-0 overflow-hidden border-transparent' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                aria-label="Show practice modes"
                title="Show practice modes"
                tabIndex={(showSidebar || isMobileSidebarOpen) ? -1 : 0}
              >
                <PanelLeft size={16} />
                <span className="hidden sm:inline">Modes</span>
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${MODE_CONFIGS[session.mode].dot}`} aria-hidden />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{MODE_CONFIGS[session.mode].title}</span>
                <span className="hidden sm:inline text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">· {MODE_CONFIGS[session.mode].scenarios?.find((s) => s.id === scenarioId)?.label ?? MODE_CONFIGS[session.mode].tagline}</span>
              </div>
              <button
                onClick={() => setShowAssessment(true)}
                className={`h-9 hidden lg:flex items-center gap-1.5 px-2.5 rounded-xl border text-xs font-bold transition-all ${showAssessment ? 'invisible w-0 px-0 overflow-hidden border-transparent' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                aria-label="Show assessment"
                title="Show assessment panel"
                tabIndex={showAssessment ? -1 : 0}
              >
                <PanelRight size={16} />
                <span>Stats</span>
              </button>
            </div>
            <div ref={scrollRef} className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 scroll-smooth ${showAssessment ? 'pb-40 lg:pb-6' : ''}`}>
              {!session.isActive && !isConnecting && (
                <div className="min-h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8 px-2">
                  {(() => {
                    const mc = MODE_CONFIGS[session.mode];
                    return (
                      <>
                        <div className={`w-full text-left rounded-2xl border px-4 py-3 mb-5 ${mc.accent}`}>
                          <div className="text-xs font-bold uppercase tracking-widest opacity-70">{mc.coachRole} · {mc.tagline}</div>
                          <div className="text-lg font-bold">{mc.title}</div>
                          <div className="text-xs mt-1 opacity-80">{mc.description}</div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {mc.skills.map((s) => (
                              <span key={s} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 dark:bg-black/20">{s}</span>
                            ))}
                          </div>
                        </div>
                        <h2 className="text-2xl font-bold mb-2 dark:text-white">
                          {session.mode === AppMode.TRANSLATE ? 'Ready to Translate?' : session.mode === AppMode.CUSTOM ? 'Ready for Class?' : 'Ready to Speak English?'}
                        </h2>

                        {mc.scenarios && (
                          <div className="w-full mb-4">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-left">
                              {session.mode === AppMode.DAILY ? 'Choose a topic' : session.mode === AppMode.MEETING ? 'Choose meeting type' : session.mode === AppMode.PRESENTATION ? 'Choose stage' : session.mode === AppMode.CUSTOM ? 'Choose goal' : 'Choose context'}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {mc.scenarios.map((sc) => (
                                <button
                                  key={sc.id}
                                  onClick={() => { setScenarioId(sc.id); scenarioRef.current = sc.id; }}
                                  className={`text-left px-3 py-2.5 rounded-2xl border text-xs transition-all ${scenarioId === sc.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                                >
                                  <div className="font-bold text-sm dark:text-white"><span className="mr-1">{sc.icon}</span>{sc.label}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {session.mode === AppMode.CUSTOM && (
                          <div className="w-full mb-4 text-left">
                            <label htmlFor="custom-topic" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                              What do you want to learn today?
                            </label>
                            <input
                              id="custom-topic"
                              type="text"
                              value={customTopic}
                              onChange={(e) => setCustomTopic(e.target.value)}
                              placeholder="e.g., used to vs be used to, present perfect..."
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {mc.starters.map((s) => (
                                <button key={s} onClick={() => setCustomTopic(s)} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30">{s}</button>
                              ))}
                            </div>
                            <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">🎓 AI giảng → ví dụ → drill → sửa chi tiết. Cuối buổi có quiz 3 câu.</p>
                          </div>
                        )}

                        {(session.mode === AppMode.DAILY || session.mode === AppMode.MEETING || session.mode === AppMode.PRESENTATION) && (
                          <div className="w-full mb-4 text-left">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Quick starters</div>
                            <div className="flex flex-wrap gap-1.5">
                              {mc.starters.map((s) => (
                                <button key={s} onClick={() => { setInputText(s); }} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-100">“{s}”</button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {startError && (
                    <div role="alert" className="w-full mb-4 text-left text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
                      ⚠️ {startError}
                    </div>
                  )}

                  <button
                    onClick={() => void startSession(session.mode)}
                    disabled={session.mode === AppMode.CUSTOM && !customTopic.trim()}
                    className={`bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-bold transition-all transform hover:scale-105 shadow-lg ${session.mode === AppMode.CUSTOM && !customTopic.trim() ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                  >
                    Start Session Now
                  </button>
                  <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">💡 {MODE_CONFIGS[session.mode].tip}</p>
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

              {transcriptions.length === 0 && session.isActive && (
                <div className={`rounded-2xl border px-4 py-3 text-xs ${MODE_CONFIGS[session.mode].accent}`}>
                  <span className="font-bold">{MODE_CONFIGS[session.mode].coachRole}: </span>
                  {MODE_CONFIGS[session.mode].scenarios?.find((s) => s.id === scenarioId)?.setup ?? MODE_CONFIGS[session.mode].description}
                  {session.mode === AppMode.CUSTOM && customTopic ? ` · Topic: ${customTopic}` : ''}
                </div>
              )}
              {transcriptions.map((t) => (
                <div key={t.id} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}>
                  <div
                    className={`max-w-[92%] sm:max-w-[85%] md:max-w-[70%] p-3 sm:p-4 rounded-2xl relative group/msg ${
                      t.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none shadow-sm'
                    }`}
                  >
                    {t.role === 'model' && (
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">{MODE_CONFIGS[session.mode].coachRole}</div>
                    )}
                    <div className="text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words">
                      {t.text === '' && t.role === 'model' ? (
                        <span className="inline-flex items-center gap-2 text-slate-400">
                          <Loader2 size={14} className="animate-spin" /> thinking...
                        </span>
                      ) : (
                        renderMessageText(t.text)
                      )}
                    </div>

                    <div className="absolute top-2 right-2 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity flex gap-1">
                      <button
                        onClick={async () => {
                          if (t.translation) {
                            setTranscriptions((prev) => prev.map((item) => (item.id === t.id ? { ...item, translation: undefined } : item)));
                            return;
                          }
                          const result = await translatePhrase(config, t.text);
                          setTranscriptions((prev) => prev.map((item) => (item.id === t.id ? { ...item, translation: result || undefined } : item)));
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${t.role === 'user' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 shadow-sm'}`}
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
                        className={`mt-3 pt-3 border-t ${t.role === 'user' ? 'border-white/10 text-blue-100' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'} text-xs italic leading-relaxed`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 font-bold uppercase tracking-tighter opacity-70">
                          <Sparkles size={10} />
                          <span>Vietnamese Translation</span>
                        </div>
                        {t.translation}
                      </motion.div>
                    )}
                    {t.role === 'user' && (t.wpm || t.fillerCount) && (
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                        {t.wpm ? `${t.wpm} WPM` : ''}{t.wpm && t.fillerCount ? ' · ' : ''}{t.fillerCount ? `${t.fillerCount} filler${t.fillerCount > 1 ? 's' : ''}` : ''}
                      </div>
                    )}
                  </div>

                  {t.role === 'user' && t.suggestion && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-500 max-w-[80%] flex flex-col items-end">
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 rounded-2xl rounded-tr-none py-2 px-4 text-xs md:text-sm shadow-sm">
                        <div className="flex items-center gap-1.5 font-bold mb-1">
                          <span className="text-xs" aria-hidden>
                            💡
                          </span>
                          <span>Natural Phrasing</span>
                        </div>
                        <p className="italic font-medium leading-relaxed">{renderMessageText(`"${t.suggestion}"`)}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Persistent Control Bar */}
            <div className="p-2 sm:p-4 pb-[env(safe-area-inset-bottom)] bg-slate-50 dark:bg-slate-900/50 border-t dark:border-slate-800 flex flex-col gap-2 sm:gap-3 transition-colors shrink-0">
              {/* Universal text input — works in every mode (mic fallback) */}
              {session.isActive && (
                <div className="flex flex-col gap-2">
                {(MODE_CONFIGS[session.mode].phraseBank?.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => setShowPhrases((v) => !v)} className="self-start text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
                      {showPhrases ? '▾ Hide useful phrases' : '▸ Useful phrases for this mode'}
                    </button>
                    {showPhrases && (
                      <div className="flex flex-wrap gap-1.5">
                        {MODE_CONFIGS[session.mode].phraseBank!.map((p) => (
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
                        sendTextMessage(inputText);
                      }
                    }}
                    placeholder={session.mode === AppMode.TRANSLATE ? 'Nhập câu tiếng Việt bạn muốn dịch...' : '…or type here if mic fails — Enter to send'}
                    className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-[16px] sm:text-sm px-2 dark:text-white outline-none"
                  />
                  <button
                    onClick={() => sendTextMessage(inputText)}
                    disabled={!inputText.trim()}
                    className="p-2.5 sm:p-2 shrink-0 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Send message"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => stopSession(true)}
                    className="p-2.5 sm:p-2 shrink-0 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-500 transition-colors"
                    title="Stop Session (auto-saves)"
                    aria-label="Stop session"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 pl-1">Audio</span>
                  {isSpeaking ? (
                    <button
                      onClick={stopSpeaking}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold hover:bg-amber-200 transition-colors"
                      title="Interrupt coach (stop speaking)"
                      aria-label="Interrupt coach"
                    >
                      <Square className="w-3.5 h-3.5" /> Stop
                    </button>
                  ) : (
                    <button
                      onClick={replayLast}
                      disabled={!lastCoachTextRef.current}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors disabled:opacity-40"
                      title="Replay last coach reply"
                      aria-label="Replay last reply"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Replay
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const md = transcriptToMarkdown(transcriptionsRef.current, modeRef.current);
                      navigator.clipboard?.writeText(md).catch(() => {});
                      setCopiedAll(true);
                      setTimeout(() => setCopiedAll(false), 1200);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors"
                    title="Copy transcript"
                    aria-label="Copy transcript"
                  >
                    {copiedAll ? <Sparkles className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />} {copiedAll ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => downloadText(`fluentdev-${modeRef.current}-${Date.now()}.md`, transcriptToMarkdown(transcriptionsRef.current, modeRef.current))}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors"
                    title="Download transcript (.md)"
                    aria-label="Download transcript"
                  >
                    <Download className="w-3.5 h-3.5" /> Save
                  </button>
                </div>
                </div>
              )}

              {session.mode !== AppMode.TRANSLATE && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3 sm:space-x-4 flex-wrap gap-y-2 min-w-0">
                    <div className="relative flex items-center justify-center">
                      <div className={`w-4 h-4 rounded-full ${session.isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
                      {session.isActive && <div className="absolute w-8 h-8 bg-green-500/20 rounded-full animate-ping"></div>}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {session.isActive
                          ? isProcessing
                            ? session.mode === AppMode.CUSTOM ? 'Teacher is checking your answer...' : 'Coach is thinking...'
                            : isSpeaking
                              ? session.mode === AppMode.CUSTOM ? 'Teacher is explaining...' : 'Coach is speaking...'
                              : isListening
                                ? 'Session Active'
                                : 'Listening paused'
                          : 'Ready to Start'}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                        {session.isActive ? `Mode: ${MODE_INFO[session.mode].title}` : 'Select a mode to begin'}
                      </span>
                    </div>

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
                    {session.isActive && config.sttEngine === 'browser' && isListening && !isProcessing && !isSpeaking && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                        <div className="flex gap-0.5" aria-hidden>
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="w-1 h-3 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}></div>
                          ))}
                        </div>
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tight">Listening</span>
                      </div>
                    )}

                    {session.isActive && config.sttEngine === 'browser' && !autoListen && !isListening && !isProcessing && !isSpeaking && (
                      <button
                        onClick={() => startRecognition()}
                        className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all animate-in fade-in"
                        aria-label="Continue listening"
                      >
                        <Mic size={16} />
                        Continue
                      </button>
                    )}

                    {session.isActive && config.sttEngine === 'custom' && (
                      <button
                        onPointerDown={startRecording}
                        onPointerUp={stopRecording}
                        onPointerLeave={stopRecording}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          startRecording();
                        }}
                        onTouchEnd={stopRecording}
                        className={`flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl font-bold text-sm transition-all border touch-none select-none ${
                          isRecording
                            ? 'bg-red-500 text-white border-red-500 shadow-red-200 shadow-md'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                        aria-label={isRecording ? 'Recording, release to send' : 'Hold to speak'}
                        title="Hold to speak"
                      >
                        <Mic size={16} className={isRecording ? 'animate-pulse' : ''} />
                        {isRecording ? 'Recording... release to send' : 'Hold to Speak'}
                      </button>
                    )}

                    {session.isActive ? (
                      <button
                        onClick={() => void finishAndAssess()}
                        className="w-full sm:w-auto justify-center bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 rounded-xl font-bold text-sm transition-all shadow-md flex items-center gap-2"
                      >
                        <span aria-hidden>🏁</span>
                        Finish & Assess
                      </button>
                    ) : (
                      <button
                        onClick={() => void startSession(session.mode)}
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
          </section>

          {/* Assessment Panel (Right Side) - Desktop */}
          <AnimatePresence>
            {showAssessment && (
              <motion.aside
                initial={{ width: 0, opacity: 0, x: 20 }}
                animate={{ width: 420, opacity: 1, x: 0 }}
                exit={{ width: 0, opacity: 0, x: 20 }}
                className="hidden lg:flex flex-col min-h-0 overflow-hidden shrink-0"
                aria-label="Assessment panel"
              >
                <div className="w-[420px] h-full flex flex-col min-h-0">
                  <div className="flex items-center justify-between px-1 pb-2 shrink-0">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Assessment</span>
                    <button
                      onClick={() => setShowAssessment(false)}
                      className="h-9 flex items-center gap-1.5 px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-all shadow-sm"
                      aria-label="Collapse assessment panel"
                      title="Collapse assessment"
                    >
                      <ChevronsRight size={16} />
                      <span>Hide</span>
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    <AssessmentPanel assessment={assessment} hasData={hasAssessmentData} duration={duration} avgWpm={avgWpm} fillerTotal={fillerTotal} turns={userTurns} streak={streak} xp={xp} mode={session.mode} />
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </main>

        {/* Mobile Assessment Drawer — collapsible bottom sheet */}
        <AnimatePresence>
          {showAssessment && (
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed bottom-0 left-0 right-0 max-h-[55dvh] overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-3xl shadow-2xl z-20 px-3 pt-2 pb-[env(safe-area-inset-bottom)]"
              aria-label="Mobile assessment"
            >
              <div className="sticky top-0 bg-white dark:bg-slate-900 pt-1 pb-2 z-10">
                <div className="mx-auto w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mb-1" aria-hidden />
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">📊 Assessment</span>
                  <button
                    onClick={() => setShowAssessment(false)}
                    className="p-2 -m-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Hide assessment"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="px-1 pb-4">
                <AssessmentPanel assessment={assessment} hasData={hasAssessmentData} duration={duration} avgWpm={avgWpm} fillerTotal={fillerTotal} turns={userTurns} streak={streak} xp={xp} mode={session.mode} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating stats button on mobile when sheet hidden */}
        {!showAssessment && (
          <button
            onClick={() => setShowAssessment(true)}
            className="lg:hidden fixed bottom-24 right-3 z-20 flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold shadow-xl active:scale-95 transition-transform"
            aria-label="Show assessment"
          >
            📊 Stats
          </button>
        )}

        {showSettings && <SettingsModal initial={config} onClose={() => setShowSettings(false)} onSaved={(cfg) => setConfig(cfg)} />}
        {showLibrary && <LibraryPanel config={config} onClose={() => { setShowLibrary(false); setStreak(getStreak()); setXp(totalXP()); }} onPractice={(mode, prefill) => {
          setShowLibrary(false);
          if (mode === AppMode.CUSTOM) setCustomTopic(prefill);
          if (mode === AppMode.DAILY) setInputText(prefill);
          if (session.mode !== mode) {
            const def = MODE_CONFIGS[mode]?.scenarios?.[0]?.id;
            if (def) { setScenarioId(def); scenarioRef.current = def; }
            setSession((prev) => ({ ...prev, mode }));
          }
        }} />}
      </div>
    </AIConfigProvider>
  );
};

export default App;
