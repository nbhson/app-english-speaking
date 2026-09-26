import React, { useState, useEffect, useRef } from 'react';
import { AppMode, TranscriptionEntry, SessionState, SpeechRecognition } from './types';
import { SYSTEM_INSTRUCTION, MODE_INFO } from './constants';
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
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SelectionTranslator } from './components/SelectionTranslator';
import { HoverableWord } from './components/HoverableWord';
import { CorrectionCard } from './components/CorrectionCard';
import { AssessmentPanel } from './components/AssessmentPanel';
import { AIConfigProvider } from './context/AIConfigContext';
import { INITIAL_ASSESSMENT, parseAssessmentBlock } from './utils/assessment';
import { Languages, Sparkles, Mic, X, ChevronRight, Loader2 } from 'lucide-react';
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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

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
      startRecognition();
    }
  };

  const systemPrompt = (mode: AppMode) =>
    SYSTEM_INSTRUCTION +
    `\n\nCURRENT MODE: ${mode}` +
    (mode === AppMode.CUSTOM && customTopicRef.current.trim()
      ? `\nTOPIC TO FOCUS ON (STRICT - DO NOT DIGRESS): ${customTopicRef.current.trim()}\nYou MUST constrain all questions, examples, and corrections to this exact topic/structure. If the user wrote "chỉ", "only", "just", treat it as a hard boundary and do not introduce any other topic.`
      : '');

  const speakText = async (text: string) => {
    const clean = text
      .replace(/\[Correction\][\s\S]*?\[\/Correction\]/g, '')
      .replace(/\[Assessment\][\s\S]*?\[\/Assessment\]/g, '')
      .replace(/\[Insight\][\s\S]*?\[\/Insight\]/g, '')
      .trim();
    if (!clean) return;

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

    setTranscriptions((prev) => [...prev, { id: uid(), role: 'user', text, timestamp: Date.now() }]);

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

  const stopSession = () => {
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
          'The student has ended the session. Please provide a final assessment using the [Assessment] block, briefly summarize strengths and areas to improve, then say goodbye.',
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
    setTimeout(() => stopSession(), 1200);
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
        className={`flex flex-col h-screen overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} selection:bg-blue-100 selection:text-blue-900`}
      >
        <Header
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          showSidebar={showSidebar}
          toggleSidebar={() => {
            if (window.innerWidth < 768) setIsMobileSidebarOpen((v) => !v);
            else setShowSidebar(!showSidebar);
          }}
          showAssessment={showAssessment}
          toggleAssessment={() => setShowAssessment(!showAssessment)}
          onOpenSettings={() => setShowSettings(true)}
        />
        <SelectionTranslator config={config} />

        <main className="flex-1 flex flex-col md:flex-row max-w-[1600px] mx-auto w-full p-4 md:p-6 gap-6 h-[calc(100vh-64px)] overflow-hidden relative">
          {/* Desktop Sidebar */}
          <AnimatePresence>
            {showSidebar && (
              <motion.nav
                initial={{ width: 0, opacity: 0, x: -20 }}
                animate={{ width: 280, opacity: 1, x: 0 }}
                exit={{ width: 0, opacity: 0, x: -20 }}
                className="hidden md:flex flex-col shrink-0 overflow-hidden"
                aria-label="Desktop practice modes"
              >
                <div className="w-[280px]">
                  <Sidebar activeMode={session.mode} onChangeMode={changeMode} />
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
                  className="fixed left-0 top-16 bottom-0 w-[300px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-40 md:hidden p-4 overflow-y-auto"
                  aria-label="Mobile practice modes"
                >
                  <Sidebar activeMode={session.mode} onChangeMode={changeMode} />
                </motion.nav>
              </>
            )}
          </AnimatePresence>

          {/* Chat / Interaction Area */}
          <section className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors min-w-0">
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth">
              {!session.isActive && !isConnecting && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-6">
                    <span className="text-4xl" aria-hidden>
                      {session.mode === AppMode.TRANSLATE ? '⌨️' : '🎙️'}
                    </span>
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
                      <label htmlFor="custom-topic" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-left">
                        What topic do you want to practice?
                      </label>
                      <input
                        id="custom-topic"
                        type="text"
                        value={customTopic}
                        onChange={(e) => setCustomTopic(e.target.value)}
                        placeholder="e.g., Job Interview, Travel to Japan, Ordering Coffee..."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      />
                    </div>
                  )}

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
                  <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">💡 Tip: Hover or focus any word to see its translation!</p>
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

              {transcriptions.map((t) => (
                <div key={t.id} className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}>
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
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t dark:border-slate-800 flex flex-col gap-4 transition-colors">
              {session.isActive && session.mode === AppMode.TRANSLATE && (
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <label htmlFor="translate-input" className="sr-only">
                    Vietnamese input
                  </label>
                  <input
                    id="translate-input"
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
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-2 dark:text-white outline-none"
                  />
                  <button
                    onClick={() => sendTextMessage(inputText)}
                    disabled={!inputText.trim()}
                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Send message"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={stopSession}
                    className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-500 transition-colors"
                    title="Stop Session"
                    aria-label="Stop session"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {session.mode !== AppMode.TRANSLATE && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3 md:space-x-4 flex-wrap gap-y-2">
                    <div className="relative flex items-center justify-center">
                      <div className={`w-4 h-4 rounded-full ${session.isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
                      {session.isActive && <div className="absolute w-8 h-8 bg-green-500/20 rounded-full animate-ping"></div>}
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

                  <div className="flex items-center space-x-2 md:space-x-4 flex-wrap gap-y-2">
                    {session.isActive && config.sttEngine === 'browser' && isListening && !isProcessing && !isSpeaking && (
                      <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
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
                        className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all animate-in fade-in"
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
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${
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
                        className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-md flex items-center gap-2"
                      >
                        <span aria-hidden>🏁</span>
                        Finish & Assess
                      </button>
                    ) : (
                      <button
                        onClick={() => void startSession(session.mode)}
                        className="w-14 h-14 flex items-center justify-center rounded-full transition-all group relative bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200 shadow-xl"
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
                <div className="w-[420px] h-full overflow-y-auto pr-1">
                  <AssessmentPanel assessment={assessment} hasData={hasAssessmentData} duration={duration} />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </main>

        {/* Mobile Assessment Drawer */}
        <AnimatePresence>
          {showAssessment && (
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              className="lg:hidden fixed bottom-0 left-0 right-0 max-h-[60vh] overflow-y-auto bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-3xl shadow-2xl z-20 p-4"
              aria-label="Mobile assessment"
            >
              <AssessmentPanel assessment={assessment} hasData={hasAssessmentData} duration={duration} />
            </motion.div>
          )}
        </AnimatePresence>

        {showSettings && <SettingsModal initial={config} onClose={() => setShowSettings(false)} onSaved={(cfg) => setConfig(cfg)} />}
      </div>
    </AIConfigProvider>
  );
};

export default App;
