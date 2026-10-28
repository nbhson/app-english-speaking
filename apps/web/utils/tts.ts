// Unified text-to-speech service. This is the ONLY place that plays audio:
// coach replies (with state callbacks) and short ambient pronunciations
// (tooltips / corrections / voice preview). The engine is driven by AIConfig:
//   - 'custom'   → POST /v1/audio/speech, blob → HTMLAudioElement
//   - 'browser'  → window.speechSynthesis (+ Chrome silent-hang watchdog)

import type { AIConfig } from './api';
import { speech } from './api';
import { resolveVoice } from './browser';
import { stripAiBlocks } from './aiBlocks';
import { stripMarkdownForSpeech } from './markdown';

export interface SpeakHandlers {
  onStart?: () => void;
  /** Exactly once per speak call: natural end, watchdog end or playback failure. */
  onEnd?: () => void;
}

/**
 * Monotonic token for the newest coach speech. A coach speak() takes an epoch;
 * its onEnd handlers only fire if it is still the latest (a barge-in or a new
 * speak invalidates older ones and swallows their callbacks).
 */
let coachEpoch = 0;
let coachAudio: HTMLAudioElement | null = null;
let coachFetchAbort: AbortController | null = null;
let ambientAudio: HTMLAudioElement | null = null;
let watchdogTimer: number | null = null;

/** Strip AI blocks + markdown + emoji before anything reaches a speech engine. */
export function prepareSpeakable(text: string): string {
  return stripMarkdownForSpeech(stripAiBlocks(text)).trim();
}

/** Stop current ambient (tooltip/correction/preview) audio. */
export function stopAmbient(): void {
  if (ambientAudio) {
    try {
      ambientAudio.pause();
    } catch {
      /* ignore */
    }
    ambientAudio = null;
  }
}

/** Release all coach audio/abort resources without touching the epoch. */
function teardownCoachAudio(): void {
  if (coachFetchAbort) {
    try {
      coachFetchAbort.abort();
    } catch {
      /* ignore */
    }
    coachFetchAbort = null;
  }
  if (coachAudio) {
    try {
      coachAudio.pause();
    } catch {
      /* ignore */
    }
    coachAudio = null;
  }
  if (watchdogTimer !== null) {
    window.clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

/** Barge-in: stop the current coach speech and invalidate its handlers. */
export function stopCoachSpeech(): void {
  coachEpoch += 1;
  teardownCoachAudio();
}

/**
 * Speak a coach reply. Cancels any previous coach speech, reports onStart
 * immediately (so STT stays paused while custom TTS audio is fetched) and
 * reports onEnd exactly once — suppressed if a newer speak/barge happened.
 */
export async function speakCoachText(
  rawText: string,
  config: AIConfig,
  handlers: SpeakHandlers = {},
): Promise<void> {
  const text = prepareSpeakable(rawText);
  if (!text) return;

  const epoch = ++coachEpoch;
  teardownCoachAudio();
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    if (epoch === coachEpoch) handlers.onEnd?.();
  };

  if (config.ttsEngine === 'custom') {
    handlers.onStart?.();
    const ctl = new AbortController();
    coachFetchAbort = ctl;
    try {
      const blob = await speech(config, text, ctl.signal);
      if (epoch !== coachEpoch) return;
      coachFetchAbort = null;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      coachAudio = audio;
      await new Promise<void>((resolve, reject) => {
        const cleanup = (err?: Error) => {
          URL.revokeObjectURL(url);
          if (coachAudio === audio) coachAudio = null;
          finish();
          if (err) reject(err);
          else resolve();
        };
        audio.onended = () => cleanup();
        audio.onerror = () => cleanup(new Error('Audio playback failed'));
        audio.play().catch((e: unknown) => cleanup(e instanceof Error ? e : new Error(String(e))));
      });
    } catch (e) {
      coachFetchAbort = null;
      if (coachAudio) {
        try {
          coachAudio.pause();
        } catch {
          /* ignore */
        }
        coachAudio = null;
      }
      if (epoch === coachEpoch) console.error('TTS error', e);
      finish();
    }
    return;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = config.ttsRate ?? 1;
  u.pitch = config.ttsPitch ?? 1;
  const v = resolveVoice(config.ttsVoiceURI);
  if (v) u.voice = v;
  u.onend = finish;
  u.onerror = finish;
  window.speechSynthesis.speak(u);
  handlers.onStart?.();

  // Chrome bug watchdog: speechSynthesis can report finished but never fire onend.
  const watchdog = () => {
    if (ended || epoch !== coachEpoch) return;
    if (!('speechSynthesis' in window)) return;
    if (!window.speechSynthesis.speaking) {
      finish();
      return;
    }
    watchdogTimer = window.setTimeout(watchdog, 200);
  };
  watchdogTimer = window.setTimeout(watchdog, 200);
}

/**
 * Short fire-and-forget pronunciation (tooltips, correction alternatives).
 * Never touches coach state or the coach epoch; best-effort only.
 */
export function speakAmbient(config: AIConfig, text: string): void {
  const clean = prepareSpeakable(text);
  if (!clean) return;
  void (async () => {
    if (config.ttsEngine === 'custom') {
      let url: string | null = null;
      try {
        const blob = await speech(config, clean);
        url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        ambientAudio = audio;
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            resolve();
          };
          audio.onerror = () => reject(new Error('Audio playback failed'));
          audio.play().catch(reject);
        });
      } catch (e) {
        console.error('TTS error', e);
      } finally {
        ambientAudio = null;
        if (url) URL.revokeObjectURL(url);
      }
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'en-US';
      u.rate = config.ttsRate ?? 1;
      u.pitch = config.ttsPitch ?? 1;
      const v = resolveVoice(config.ttsVoiceURI);
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    }
  })();
}

/**
 * Voice preview for Settings' "Test voice". Same engineering as ambient but
 * resolves as soon as playback starts (not at natural end), so the button
 * spinner mirrors the old behaviour and errors surface to the caller.
 */
export async function speakPreview(text: string, config: AIConfig): Promise<void> {
  stopAmbient();
  const clean = prepareSpeakable(text);
  if (!clean) return;
  if (config.ttsEngine === 'custom') {
    const blob = await speech(config, clean);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    ambientAudio = audio;
    const release = () => {
      URL.revokeObjectURL(url);
      if (ambientAudio === audio) ambientAudio = null;
    };
    audio.onended = release;
    audio.onerror = release;
    await audio.play();
    return;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'en-US';
    u.rate = config.ttsRate ?? 1;
    u.pitch = config.ttsPitch ?? 1;
    const v = resolveVoice(config.ttsVoiceURI);
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  }
}
