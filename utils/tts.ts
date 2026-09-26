import type { AIConfig } from './api';
import { speech } from './api';

/**
 * Speak text using configured TTS engine.
 * Handles object URL cleanup properly even when interrupted.
 */
export async function speakWord(config: AIConfig, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  if (config.ttsEngine === 'custom') {
    let url: string | null = null;
    let audio: HTMLAudioElement | null = null;
    try {
      const blob = await speech(config, clean);
      url = URL.createObjectURL(blob);
      audio = new Audio(url);
      await new Promise<void>((resolve, reject) => {
        if (!audio || !url) return resolve();
        const revoke = () => {
          if (url) {
            URL.revokeObjectURL(url);
            url = null;
          }
        };
        audio.onended = () => {
          revoke();
          resolve();
        };
        audio.onerror = () => {
          revoke();
          reject(new Error('Audio playback failed'));
        };
        audio.play().catch(reject);
      });
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      throw e;
    }
  } else if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'en-US';
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * Speak text and return control immediately (fire-and-forget with error logging).
 */
export function speakWordFireAndForget(config: AIConfig, text: string): void {
  speakWord(config, text).catch((e) => console.error('TTS error', e));
}
