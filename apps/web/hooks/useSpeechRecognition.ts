// Speech recognition + push-to-talk recording lifecycle, extracted from App.tsx.
// Owns: Web Speech recognition object, the 3s turn-buffering window (speech
// continues grouping across recognition restarts), and MediaRecorder push-to-talk.
// Does NOT own: mic stream (session level), chat state, or recognition feature
// detection (callers decide whether browser STT is even available).

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppMode, SpeechRecognition } from '../types';
import type { AIConfig } from '../utils/api';

export const SILENCE_FLUSH_MS = 3000;

export interface SpeechStatus {
  active: boolean;
  mode: AppMode;
  engine: AIConfig['sttEngine'];
  processing: boolean;
  speaking: boolean;
  autoListen: boolean;
}

interface UseSpeechRecognitionArgs {
  /** Latest cross-cutting state (refs owned by App) read via getters. */
  getStatus: () => SpeechStatus;
  /** Current mic stream (null when not granted / not needed). */
  getStream: () => MediaStream | null;
  /** Flush buffer via processUserTextRef — stable callback. */
  onSpeechFlush: (text: string) => void;
  /** A brand-new utterance started (turn WPM window). */
  onTurnStart: () => void;
  /** Push-to-talk recording finished; hand blob to the transcription flow. */
  onHoldRecording: (blob: Blob) => void;
  /** Asymmetric STT failure (permission etc.) — user-visible message, ends session. */
  onFatalError: (message: string) => void;
  /** Non-fatal setup failure (unsupported/unexpected). */
  onError: (message: string) => void;
}

export interface UseSpeechRecognitionApi {
  isListening: boolean;
  isRecording: boolean;
  startRecognition: () => void;
  stopRecognition: () => void;
  resumeListening: () => void;
  setupRecognition: () => void;
  startRecording: () => void;
  stopRecording: () => void;
  clearSilenceTimer: () => void;
  resetBuffer: () => void;
  pendingSpeech: () => string;
}

export function useSpeechRecognition(args: UseSpeechRecognitionArgs): UseSpeechRecognitionApi {
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });

  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionStartedRef = useRef(false);

  // STT turn buffering: group finals across restarts, flush after SILENCE_FLUSH_MS.
  const speechBufferRef = useRef('');
  const interimRef = useRef('');
  const silenceTimerRef = useRef<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const startRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || recognitionStartedRef.current) return;
    try {
      rec.start();
      recognitionStartedRef.current = true;
      setIsListening(true);
    } catch (e) {
      console.error('Failed to start recognition', e);
    }
  }, []);

  const stopRecognition = useCallback(() => {
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
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const flushSpeechBuffer = useCallback(() => {
    clearSilenceTimer();
    const buffered = `${speechBufferRef.current} ${interimRef.current}`.trim();
    speechBufferRef.current = '';
    interimRef.current = '';
    if (buffered) argsRef.current.onSpeechFlush(buffered);
  }, [clearSilenceTimer]);

  const scheduleSilenceFlush = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      flushSpeechBuffer();
    }, SILENCE_FLUSH_MS);
  }, [clearSilenceTimer, flushSpeechBuffer]);

  const resumeListening = useCallback(() => {
    const s = argsRef.current.getStatus();
    if (!s.autoListen) return;
    if (s.active && s.engine === 'browser' && !s.processing && !s.speaking) {
      // Keep the original turn start while buffering across recognition restarts.
      if (!speechBufferRef.current.trim() && !interimRef.current.trim()) {
        argsRef.current.onTurnStart();
      }
      startRecognition();
    }
  }, [startRecognition]);

  const setupRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      argsRef.current.onError(
        'Web Speech API is not supported in this browser. Use Chrome/Edge, or switch STT to Custom Provider in Settings.'
      );
      return;
    }
    try {
      const rec = new SR();
      // VN→EN mode listens for VIETNAMESE speech; all other modes listen for English.
      rec.lang = argsRef.current.getStatus().mode === AppMode.TRANSLATE ? 'vi-VN' : 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        const s = argsRef.current.getStatus();
        if (!s.active || s.processing || s.speaking) return;

        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) finalChunk += text;
          else interimChunk += text;
        }

        const hadBuffer = speechBufferRef.current.trim().length > 0;
        if (finalChunk.trim()) {
          // Final replaces its interim preview — clear the stale interim to avoid
          // "hello how are you hello how are you" duplication.
          speechBufferRef.current = `${speechBufferRef.current} ${finalChunk}`.trim();
          interimRef.current = interimChunk.trim();
        } else if (interimChunk.trim()) {
          interimRef.current = interimChunk.trim();
        }
        // New speech started a turn — mark turn start once per utterance.
        if (!hadBuffer && speechBufferRef.current.trim()) argsRef.current.onTurnStart();
        // Any speech activity (final or interim) resets the silence window.
        // The browser auto-ends on pause; onend restarts so we keep capturing.
        if (finalChunk.trim() || interimChunk.trim()) scheduleSilenceFlush();
      };

      rec.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          argsRef.current.onFatalError(
            'Microphone not allowed for speech recognition. Check browser permissions.'
          );
        }
        // no-speech / audio-capture: transient — rely on onend restart
      };

      rec.onstart = () => setIsListening(true);

      rec.onend = () => {
        recognitionStartedRef.current = false;
        // Keep the mic indicator on while the 3s silence window is still pending.
        const hasPendingSpeech =
          speechBufferRef.current.trim().length > 0 || interimRef.current.trim().length > 0;
        if (!hasPendingSpeech) setIsListening(false);
        const s = argsRef.current.getStatus();
        if (s.active && !s.processing && !s.speaking && s.engine === 'browser') {
          // Browser auto-ends on pause — restart fast to keep capturing the same
          // utterance; the silence timer decides when the turn is really over.
          window.setTimeout(() => resumeListening(), 300);
        } else if (!hasPendingSpeech) {
          setIsListening(false);
        }
      };

      recognitionRef.current = rec;
      startRecognition();
    } catch (e) {
      console.error('Failed to init speech recognition', e);
    }
  }, [resumeListening, scheduleSilenceFlush, startRecognition]);

  const startRecording = useCallback(() => {
    const stream = argsRef.current.getStream();
    if (!stream || recorderRef.current) return;
    try {
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setIsRecording(false);
        recorderRef.current = null;
        if (blob.size > 0 && argsRef.current.getStatus().active) {
          argsRef.current.onHoldRecording(blob);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (e) {
      console.error('Failed to start recording', e);
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const resetBuffer = useCallback(() => {
    clearSilenceTimer();
    speechBufferRef.current = '';
    interimRef.current = '';
  }, [clearSilenceTimer]);

  const pendingSpeech = useCallback(() => `${speechBufferRef.current} ${interimRef.current}`.trim(), []);

  return {
    isListening,
    isRecording,
    startRecognition,
    stopRecognition,
    resumeListening,
    setupRecognition,
    startRecording,
    stopRecording,
    clearSilenceTimer,
    resetBuffer,
    pendingSpeech,
  };
}
