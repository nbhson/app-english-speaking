import React, { useState, useEffect, useRef, Suspense } from 'react';
// LazyMotion + m (+ domAnimation): chỉ bundle engine animation cơ bản, bỏ
// layout-projection/drag của motion-dom → initial chunk nhỏ hơn đáng kể.
// strict = nếu ai import `motion` (full) sẽ throw ngay ở dev.
import { LazyMotion, AnimatePresence, m } from 'motion/react';
import { TriangleAlert, ChevronsLeft, ChevronsRight, X, PanelLeft, PanelRight } from 'lucide-react';
import { AppMode, SessionState, TranscriptionEntry } from './types';
import { SYSTEM_INSTRUCTION, DIFFICULTY_PROMPT, PERSONA_PROMPT } from './constants';
import { MODE_CONFIGS, MODE_PROMPT_SNIPPET } from './modes';
import {
  AIConfig,
  ChatMessage,
  loadConfig,
  translatePhrase,
  transcribe,
} from './utils/api';
// Heavy, user-triggered surfaces — split into async chunks (loaded on first open).
const LibraryPanel = React.lazy(() =>
  import('./components/LibraryPanel').then((mod) => ({ default: mod.LibraryPanel })),
);
const SettingsModal = React.lazy(() =>
  import('./components/SettingsModal').then((mod) => ({ default: mod.SettingsModal })),
);
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SelectionTranslator } from './components/SelectionTranslator';
import { ChatMessageList } from './components/ChatMessageList';
import { ControlBar } from './components/ControlBar';
import { StartScreen } from './components/StartScreen';
import { AssessmentPanel } from './components/AssessmentPanel';
import { Onboarding, isOnboarded } from './components/Onboarding';
import { AIConfigProvider } from './context/AIConfigContext';
import { INITIAL_ASSESSMENT, parseAssessmentBlock } from './utils/assessment';
import { analyzeSpeech, avgSkill, xpForSession } from './utils/speechMetrics';
import { isBrowserSTTSupported } from './utils/browser';
import {
  saveSession, addMistake, logSessionProgress,
  getStreak, totalXP, transcriptToMarkdown, downloadText,
} from './utils/storage';
import { mirrorSession, mirrorMistake, mirrorProgress } from './utils/serverStore';
import { uid } from './utils/uid';
import { loadUiPrefs, saveUiPrefs } from './utils/uiPrefs';
import {
  extractBlock, extractBlocks, parseCorrectionBlock, extractCorrectionSuggestion,
} from './utils/aiBlocks';
import { speakCoachText, stopCoachSpeech, prepareSpeakable } from './utils/tts';
import { runChatStream } from './utils/chatRunner';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';

// Stable, non-render-time clock (React Hooks purity-friendly).
const now = () => Date.now();

// Warm-up motion feature chunk ngay lúc app boot (non-blocking): trước khi
// user tương tác với element có animation, features gần như luôn đã sẵn sàng.
void import('./utils/motionFeatures');

const FIRST_SCENARIO: Record<AppMode, string> = {
  [AppMode.DAILY]: 'weekend',
  [AppMode.MEETING]: 'standup',
  [AppMode.PRESENTATION]: 'outline',
  [AppMode.CUSTOM]: 'understand',
  [AppMode.TRANSLATE]: 'casual',
};

const App: React.FC = () => {
  const [config, setConfig] = useState<AIConfig>(() => loadConfig());
  const [showSettings, setShowSettings] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // F4: persisted UI prefs (mode/scenario/topic/panels) — validated once at mount.
  const [initialPrefs] = useState(() => {
    const p = loadUiPrefs();
    const mode = p.mode ?? AppMode.DAILY;
    const scenarios = MODE_CONFIGS[mode]?.scenarios;
    const scenarioId = scenarios?.some((s) => s.id === p.scenarioId)
      ? p.scenarioId
      : scenarios?.[0]?.id ?? FIRST_SCENARIO[mode];
    return {
      mode,
      scenarioId: scenarioId as string,
      customTopic: p.customTopic ?? '',
      showSidebar: p.showSidebar ?? false,
      showAssessment: p.showAssessment,
    };
  });

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
    mode: initialPrefs.mode,
    startTime: null,
  });
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [assessment, setAssessment] = useState({ ...INITIAL_ASSESSMENT });
  const [hasAssessmentData, setHasAssessmentData] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSidebar, setShowSidebar] = useState(initialPrefs.showSidebar);
  const [showAssessment, setShowAssessment] = useState(() =>
    initialPrefs.showAssessment ?? (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true),
  );
  const [inputText, setInputText] = useState('');
  const [customTopic, setCustomTopic] = useState(initialPrefs.customTopic);
  const [scenarioId, setScenarioId] = useState<string>(initialPrefs.scenarioId);
  const [showPhrases, setShowPhrases] = useState(false);
  const [autoListen, setAutoListen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('fluentdev-auto-listen') !== 'false';
    }
    return true;
  });
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
  const [canReplay, setCanReplay] = useState(false);
  // Bump khi Library đóng → Header tính lại badge SRS due (F6).
  const [libraryEpoch, setLibraryEpoch] = useState(0);
  // Screen-reader announcement for finalized coach replies (aria-live).
  const [announce, setAnnounce] = useState('');
  // F2: first-run onboarding tour (replayable from Settings).
  const [showTour, setShowTour] = useState(() => (typeof window !== 'undefined' ? !isOnboarded() : false));

  // Refs that async callbacks read to avoid stale closures.
  const configRef = useRef(config);
  const transcriptionsRef = useRef<TranscriptionEntry[]>([]);
  const activeRef = useRef(false);
  const modeRef = useRef<AppMode>(initialPrefs.mode);
  const processingRef = useRef(false);
  const speakingRef = useRef(false);
  const customTopicRef = useRef('');
  const scenarioRef = useRef(FIRST_SCENARIO[AppMode.DAILY]);
  const pendingTextRef = useRef('');
  const streamRef = useRef<MediaStream | null>(null);
  const autoListenRef = useRef(autoListen);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const lastCoachTextRef = useRef('');
  const turnStartRef = useRef<number>(0);
  const wpmSamplesRef = useRef<number[]>([]);
  const processUserTextRef = useRef<(text: string) => void>(() => {});
  const stopSessionRef = useRef<() => void>(() => {});
  // Session epoch: tăng mỗi lần start/stop — guard cho timer gốc (Finish +
  // 1.5s stop tự động): nếu user start session mới trong khoảng 1.5s, timer
  // cũ KHÔNG được force-stop session mới (bug trước đây).
  const sessionEpochRef = useRef(0);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { transcriptionsRef.current = transcriptions; }, [transcriptions]);
  useEffect(() => { customTopicRef.current = customTopic; }, [customTopic]);
  useEffect(() => { scenarioRef.current = scenarioId; }, [scenarioId]);

  useEffect(() => {
    autoListenRef.current = autoListen;
    try {
      window.localStorage.setItem('fluentdev-auto-listen', autoListen ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [autoListen]);

  // F4: persist UI prefs — layout + practice context survive a reload.
  useEffect(() => {
    saveUiPrefs({ mode: session.mode, scenarioId, customTopic, showSidebar, showAssessment });
  }, [session.mode, scenarioId, customTopic, showSidebar, showAssessment]);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [transcriptions]);

  const handleChatScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "near bottom" as within 96px — user reading history won't be yanked down.
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  };

  // --- Speech recognition + push-to-talk (hook) ---

  const stt = useSpeechRecognition({
    getStatus: () => ({
      active: activeRef.current,
      mode: modeRef.current,
      engine: configRef.current.sttEngine,
      processing: processingRef.current,
      speaking: speakingRef.current,
      autoListen: autoListenRef.current,
    }),
    getStream: () => streamRef.current,
    onSpeechFlush: (buffered) => {
      void processUserTextRef.current(buffered);
    },
    onTurnStart: () => {
      turnStartRef.current = now();
    },
    onHoldRecording: (blob) => {
      setIsProcessing(true);
      transcribe(configRef.current, blob)
        .then((txt) => {
          if (txt.trim()) void processUserTextRef.current(txt);
        })
        .catch((err: unknown) => {
          console.error('STT error', err);
          setStartError(`Speech-to-text failed: ${err instanceof Error ? err.message : String(err)}`);
        })
        .finally(() => setIsProcessing(false));
    },
    onFatalError: (message) => {
      setStartError(message);
      stopSessionRef.current();
    },
    onError: (message) => setStartError(message),
  });

  // --- Prompt & streaming ---

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

  const contextMessages = (): ChatMessage[] =>
    transcriptionsRef.current
      .filter((t) => !t.error)
      .map((t) => ({
        role: (t.role === 'user' ? 'user' : 'assistant') as ChatMessage['role'],
        content: t.text,
      }));

  const finalizeModelTurn = (modelId: string, full: string) => {
    // announcement for screen readers (blocks + markdown stripped)
    const speakable = prepareSpeakable(full);
    if (speakable) setAnnounce(speakable);

    // auto-save every [Correction] block into the mistake notebook
    for (const inner of extractBlocks(full, 'Correction')) {
      const parsed = parseCorrectionBlock(inner);
      if (parsed) {
        try {
          addMistake({ ...parsed, mode: modeRef.current });
          mirrorMistake({ ...parsed, mode: modeRef.current });
        } catch { /* ignore */ }
      }
    }

    const suggestion = extractCorrectionSuggestion(full);

    const assessmentInner = extractBlock(full, 'Assessment');
    if (assessmentInner) {
      const newAssessment = parseAssessmentBlock(assessmentInner);
      setAssessment((prev) => ({ ...prev, ...newAssessment }));
      setHasAssessmentData(true);
    }

    const insight = extractBlock(full, 'Insight')?.trim();
    if (insight) {
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

    if (modeRef.current !== AppMode.TRANSLATE) void speakReply(full);
  };

  // --- TTS (single service) ---

  const speakReply = (text: string) => {
    const clean = prepareSpeakable(text);
    if (!clean) return;
    lastCoachTextRef.current = clean;
    setCanReplay(true);
    return speakCoachText(clean, configRef.current, {
      onStart: () => {
        setIsSpeaking(true);
        speakingRef.current = true;
      },
      onEnd: () => {
        setIsSpeaking(false);
        speakingRef.current = false;
        stt.resumeListening();
      },
    });
  };

  const stopSpeaking = () => {
    // barge-in: interrupt coach immediately
    stopCoachSpeech();
    setIsSpeaking(false);
    speakingRef.current = false;
    stt.resumeListening();
  };

  const replayLast = () => {
    if (lastCoachTextRef.current) void speakReply(lastCoachTextRef.current);
  };

  // --- Chat turn pipeline ---

  /**
   * Shared stream runner for a live turn or the final assessment turn.
   * Deltas/abort/errors all funnel through the same transcription updates.
   */
  const streamTurn = (messages: ChatMessage[], modelId: string, errorAnnounce: string) =>
    runChatStream(
      configRef.current,
      messages,
      {
        onDelta: (delta) => {
          setTranscriptions((prev) => prev.map((e) => (e.id === modelId ? { ...e, text: e.text + delta } : e)));
        },
        onAbort: () => {
          setTranscriptions((prev) => prev.filter((e) => e.id !== modelId));
        },
        onError: (msg) => {
          console.error('Chat error:', msg);
          setAnnounce(errorAnnounce);
          setTranscriptions((prev) =>
            prev.map((e) => (e.id === modelId ? { ...e, text: `⚠️ ${msg}`, error: true } : e)),
          );
        },
        onDone: (full) => {
          finalizeModelTurn(modelId, full);
        },
      },
      (controller) => {
        abortRef.current = controller;
      },
      () => {
        abortRef.current = null;
      },
    );

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
    stt.stopRecognition();

    // real speech metrics for this user turn
    const elapsed = Math.max(1, (now() - (turnStartRef.current || now())) / 1000);
    const m = analyzeSpeech(text, Math.min(elapsed, 120));
    wpmSamplesRef.current = [...wpmSamplesRef.current.slice(-19), m.wpm].filter((v) => v > 0);
    const avg = wpmSamplesRef.current.length ? Math.round(wpmSamplesRef.current.reduce((a, b) => a + b, 0) / wpmSamplesRef.current.length) : m.wpm;
    setAvgWpm(avg);
    setFillerTotal((v) => v + m.fillerCount);
    setUserTurns((v) => v + 1);
    turnStartRef.current = now();

    setTranscriptions((prev) => [...prev, { id: uid(), role: 'user', text, timestamp: now(), wpm: m.wpm, fillerCount: m.fillerCount }]);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(modeRef.current) },
      ...contextMessages(),
      { role: 'user', content: text },
    ];

    const modelId = uid();
    setTranscriptions((prev) => [...prev, { id: modelId, role: 'model', text: '', timestamp: now() }]);

    await streamTurn(messages, modelId, 'Có lỗi kết nối khi gửi câu trả lời. Bạn thử lại nhé.');

    processingRef.current = false;
    setIsProcessing(false);

    if (pendingTextRef.current) {
      const queued = pendingTextRef.current;
      pendingTextRef.current = '';
      void processUserText(queued);
      return;
    }
    if (activeRef.current && modeRef.current !== AppMode.TRANSLATE && configRef.current.sttEngine === 'browser') {
      setTimeout(() => stt.resumeListening(), 300);
    }
  };

  // --- Session lifecycle ---

  const persistSession = (endedTranscriptions?: TranscriptionEntry[]) => {
    try {
      // error entries (⚠️ connection failures) are not part of the conversation
      const list = (endedTranscriptions ?? transcriptionsRef.current).filter((t) => !t.error);
      if (list.length < 2) return;
      const startedAt = session.startTime ?? now();
      const endedAt = now();
      const durationSec = Math.max(1, Math.round((endedAt - startedAt) / 1000));
      const corrections = list.filter((t) => t.text.includes('[Correction]')).length;
      const avg = avgSkill(assessment);
      const xpGain = xpForSession(durationSec, userTurns, corrections);
      const rec = {
        id: uid(), mode: modeRef.current, startedAt, endedAt, durationSec,
        turns: userTurns, corrections, avgScore: avg,
        vocabPoints: assessment.vocabularyPoints, confidence: assessment.confidenceLevel,
        transcript: list,
      };
      saveSession(rec);
      mirrorSession(rec);
      const { streak: s } = logSessionProgress(durationSec, xpGain);
      setStreak(s);
      setXp(totalXP());
      void mirrorProgress(durationSec, xpGain).then((rs) => {
        if (typeof rs === 'number') setStreak(rs);
      });
    } catch (e) {
      console.error('persist session failed', e);
    }
  };

  const stopSession = (save = true) => {
    sessionEpochRef.current += 1; // vô hiệu timer Finish của session cũ
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (save && activeRef.current) persistSession();
    stt.resetBuffer();
    stt.stopRecognition();
    stt.stopRecording();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    stopCoachSpeech();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setSession((prev) => ({ ...prev, isActive: false }));
    activeRef.current = false;
    setIsConnecting(false);
    setIsProcessing(false);
    setIsSpeaking(false);
    processingRef.current = false;
    speakingRef.current = false;
    pendingTextRef.current = '';
    setInputText('');
  };

  // Keep stable refs to the latest turn/session callbacks for the STT hook.
  useEffect(() => {
    processUserTextRef.current = (text: string) => void processUserText(text);
    stopSessionRef.current = () => stopSession(true);
  });

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
    turnStartRef.current = now();
    lastCoachTextRef.current = '';
    setCanReplay(false);
    stt.resetBuffer();

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
      setSession({ isActive: true, mode, startTime: now() });
      activeRef.current = true;
      modeRef.current = mode;

      if (mode !== AppMode.TRANSLATE && configRef.current.sttEngine === 'browser') {
        stt.setupRecognition();
      }
    } catch (err: unknown) {
      console.error('Failed to start session:', err);
      const e = err as Error & { name?: string };
      setStartError(
        e?.name === 'NotAllowedError' || e?.name === 'NotFoundError'
          ? 'Microphone access was denied or unavailable. Check browser permissions and try again.'
          : `Failed to start: ${e?.message || String(err)}`,
      );
      activeRef.current = false;
    }
    setIsConnecting(false);
  };

  const changeMode = (newMode: AppMode) => {
    setIsMobileSidebarOpen(false);
    const def = MODE_CONFIGS[newMode]?.scenarios?.[0]?.id ?? FIRST_SCENARIO[newMode];
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
    // Đang có turn xử lý dở? Abort stream cũ TRƯỚC khi ghi đè abortRef —
    // trước đây controller cũ bị ghi đè, stream cũ không thể hủy và hai
    // stream cùng ghi vào transcript (race).
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Don't lose speech spoken within the 3s window when user hits Finish.
    const pendingSpeech = stt.pendingSpeech();
    stt.resetBuffer();
    if (pendingSpeech) {
      setTranscriptions((prev) => [...prev, { id: uid(), role: 'user', text: pendingSpeech, timestamp: now() }]);
    }
    stt.stopRecognition();
    processingRef.current = true;
    setIsProcessing(true);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(modeRef.current) },
      ...contextMessages(),
      ...(pendingSpeech ? [{ role: 'user' as const, content: pendingSpeech }] : []),
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
    setTranscriptions((prev) => [...prev, { id: modelId, role: 'model', text: '', timestamp: now() }]);

    await streamTurn(messages, modelId, 'Có lỗi khi tạo đánh giá cuối buổi.');

    processingRef.current = false;
    setIsProcessing(false);
    // Timer với epoch guard: nếu session mới start trong 1.5s, epoch đổi →
    // callback cũ bỏ qua thay vì force-stop session của user (bug cũ).
    const epoch = sessionEpochRef.current;
    finishTimerRef.current = setTimeout(() => {
      if (sessionEpochRef.current === epoch) stopSession(true);
    }, 1500);
  };

  // --- Transcript actions ---

  const handleToggleTranslation = async (entry: TranscriptionEntry) => {
    if (entry.translation) {
      setTranscriptions((prev) => prev.map((t) => (t.id === entry.id ? { ...t, translation: undefined } : t)));
      return;
    }
    const result = await translatePhrase(configRef.current, entry.text);
    // null = network/API failure — announce (aria-live) thay vì im lặng tuyệt đối.
    if (!result) setAnnounce('Không dịch được câu này. Kiểm tra kết nối AI rồi thử lại.');
    setTranscriptions((prev) => prev.map((t) => (t.id === entry.id ? { ...t, translation: result || undefined } : t)));
  };

  const copyTranscript = () => {
    const md = transcriptToMarkdown(transcriptionsRef.current.filter((t) => !t.error), modeRef.current);
    navigator.clipboard?.writeText(md).catch(() => {});
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1200);
  };

  const saveTranscript = () =>
    downloadText(
      `fluentdev-${modeRef.current}-${now()}.md`,
      transcriptToMarkdown(transcriptionsRef.current.filter((t) => !t.error), modeRef.current),
    );

  const toggleAutoListen = () => {
    const next = !autoListen;
    setAutoListen(next);
    if (next) {
      if (session.isActive && !isProcessing && !isSpeaking) stt.startRecognition();
    } else {
      stt.stopRecognition();
    }
  };

  return (
    <LazyMotion features={() => import('./utils/motionFeatures').then((mod) => mod.domAnimation)} strict>
    <AIConfigProvider config={config}>
      <div
        className={`flex flex-col h-dvh overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} selection:bg-blue-600 selection:text-white`}
      >
        <Header
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          onOpenSettings={() => setShowSettings(true)}
          onOpenLibrary={() => setShowLibrary(true)}
          refreshSignal={libraryEpoch}
        />
        <SelectionTranslator config={config} />
        {!browserSTT && (
          <div className="mx-4 md:mx-6 mt-3 flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300 rounded-2xl px-4 py-2.5" role="alert" lang="vi">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>Trình duyệt này không hỗ trợ Web Speech (Safari/Firefox). Hãy chuyển STT → Custom Provider trong Settings để dùng nút Hold-to-Speak, hoặc gõ text phía dưới — app vẫn học bình thường.</span>
          </div>
        )}
        <div aria-live="polite" role="status" className="sr-only">{announce}</div>

        {/* Mid-session errors (STT/mic failures) — StartScreen is hidden while
            active, so without this banner the user would never see the error. */}
        {session.isActive && startError && (
          <div
            className="mx-4 md:mx-6 mt-3 flex items-start gap-2 text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 rounded-2xl px-4 py-2.5"
            role="alert"
            lang="vi"
          >
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{startError}</span>
            <button
              onClick={() => setStartError(null)}
              className="shrink-0 p-0.5 -m-0.5 rounded text-red-400 hover:text-red-600 dark:hover:text-red-200 transition-colors"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <main className="flex-1 flex flex-col md:flex-row max-w-[1600px] mx-auto w-full p-2 sm:p-4 md:p-6 gap-3 md:gap-6 h-[calc(100dvh-56px)] sm:h-[calc(100dvh-64px)] min-h-0 overflow-hidden relative">
          {/* Desktop Sidebar */}
          <AnimatePresence>
            {showSidebar && (
              <m.nav
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
                      title="Collapse practice modes"
                    >
                      <ChevronsLeft size={16} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    <Sidebar activeMode={session.mode} onChangeMode={changeMode} />
                  </div>
                </div>
              </m.nav>
            )}
          </AnimatePresence>

          {/* Mobile Drawer */}
          <AnimatePresence>
            {isMobileSidebarOpen && (
              <>
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/40 z-30 md:hidden"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  aria-hidden="true"
                />
                <m.nav
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
                </m.nav>
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
                <span className="hidden sm:inline">Assessment</span>
              </button>
            </div>
            <div ref={scrollRef} onScroll={handleChatScroll} className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 scroll-smooth ${showAssessment ? 'pb-40 lg:pb-6' : ''}`}>
              {!session.isActive && !isConnecting && (
                <StartScreen
                  mode={session.mode}
                  scenarioId={scenarioId}
                  customTopic={customTopic}
                  startError={startError}
                  onStart={() => void startSession(session.mode)}
                  onScenario={(id) => { setScenarioId(id); scenarioRef.current = id; }}
                  onTopic={(v) => {
                    if (session.mode === AppMode.CUSTOM) setCustomTopic(v);
                    else setInputText(v);
                  }}
                />
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

              <ChatMessageList
                entries={transcriptions}
                mode={session.mode}
                coachLabel={MODE_CONFIGS[session.mode].coachRole}
                intro={
                  transcriptions.length === 0 && session.isActive ? (
                    <div className={`rounded-2xl border px-4 py-3 text-xs ${MODE_CONFIGS[session.mode].accent}`} lang="vi">
                      <span className="font-bold">{MODE_CONFIGS[session.mode].coachRole}: </span>
                      {MODE_CONFIGS[session.mode].scenarios?.find((s) => s.id === scenarioId)?.setup ?? MODE_CONFIGS[session.mode].description}
                      {session.mode === AppMode.CUSTOM && customTopic ? ` · Topic: ${customTopic}` : ''}
                    </div>
                  ) : undefined
                }
                onToggleTranslation={(entry) => void handleToggleTranslation(entry)}
              />
            </div>

            <ControlBar
              mode={session.mode}
              active={session.isActive}
              audio={{
                speaking: isSpeaking,
                processing: isProcessing,
                listening: stt.isListening,
                recording: stt.isRecording,
              }}
              autoListen={autoListen}
              engine={config.sttEngine}
              hasReplayable={canReplay}
              inputText={inputText}
              setInputText={setInputText}
              showPhrases={showPhrases}
              setShowPhrases={setShowPhrases}
              copiedAll={copiedAll}
              onSend={() => sendTextMessage(inputText)}
              onStopSession={() => stopSession(true)}
              onStopSpeaking={stopSpeaking}
              onReplay={replayLast}
              onCopyTranscript={copyTranscript}
              onSaveTranscript={saveTranscript}
              onFinish={() => void finishAndAssess()}
              onStartingSession={() => void startSession(session.mode)}
              onToggleAutoListen={toggleAutoListen}
              onStartRecognition={() => stt.startRecognition()}
              onHoldStart={stt.startRecording}
              onHoldEnd={stt.stopRecording}
            />
          </section>

          {/* Assessment Panel (Right Side) - Desktop */}
          <AnimatePresence>
            {showAssessment && (
              <m.aside
                initial={{ width: 0, opacity: 0, x: 20 }}
                animate={{ width: 420, opacity: 1, x: 0 }}
                exit={{ width: 0, opacity: 0, x: 20 }}
                className="hidden lg:flex flex-col shrink-0 overflow-hidden bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm"
                aria-label="Assessment panel"
              >
                <div className="w-[420px] flex flex-col h-full">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Assessment</span>
                    <button
                      onClick={() => setShowAssessment(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                      aria-label="Collapse assessment panel"
                      title="Collapse assessment panel"
                    >
                      <ChevronsRight size={16} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    <AssessmentPanel assessment={assessment} hasData={hasAssessmentData} duration={duration} avgWpm={avgWpm} fillerTotal={fillerTotal} turns={userTurns} streak={streak} xp={xp} mode={session.mode} />
                  </div>
                </div>
              </m.aside>
            )}
          </AnimatePresence>
        </main>

        {/* Mobile Assessment Drawer — collapsible bottom sheet */}
        <AnimatePresence>
          {showAssessment && (
            <m.div
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
            </m.div>
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

        {showSettings && (
          <Suspense fallback={null}>
            <SettingsModal
              initial={config}
              onClose={() => setShowSettings(false)}
              onSaved={(cfg) => setConfig(cfg)}
              onReplayTour={() => { setShowSettings(false); setShowTour(true); }}
            />
          </Suspense>
        )}
        {showLibrary && <Suspense fallback={null}><LibraryPanel config={config} onClose={() => { setShowLibrary(false); setStreak(getStreak()); setXp(totalXP()); setLibraryEpoch((v) => v + 1); }} onPractice={(mode, prefill) => {
          setShowLibrary(false);
          if (mode === AppMode.CUSTOM) setCustomTopic(prefill);
          if (mode === AppMode.DAILY) setInputText(prefill);
          if (session.mode !== mode) {
            const def = MODE_CONFIGS[mode]?.scenarios?.[0]?.id;
            if (def) { setScenarioId(def); scenarioRef.current = def; }
            setSession((prev) => ({ ...prev, mode }));
          }
        }} /></Suspense>}

        {/* F2: first-run onboarding tour — replayable from Settings → Advanced. */}
        {showTour && <Onboarding onDone={() => setShowTour(false)} />}
      </div>
    </AIConfigProvider>
    </LazyMotion>
  );
};

export default App;
