// Real (text-derived) speaking metrics: WPM, filler words, pause hints.
// No server needed — computed from transcript + turn timestamps.

import type { SpeechMetrics } from '../types';

export const FILLER_WORDS = [
  'um', 'uh', 'like', 'you know', 'actually', 'basically', 'literally',
  'well', 'so', 'right', 'okay', 'hmm', 'er', 'ah',
];

export function countFillers(text: string): { count: number; words: string[] } {
  const lower = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  let count = 0;
  for (const f of FILLER_WORDS) {
    const re = new RegExp(`\\b${f.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    const m = lower.match(re);
    if (m) {
      count += m.length;
      found.push(...m.map((s) => s.trim()));
    }
  }
  return { count, words: found.slice(0, 12) };
}

export function analyzeSpeech(text: string, elapsedSec?: number): SpeechMetrics {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const charCount = text.length;
  const { count, words: fillerWords } = countFillers(text);
  // If caller passes measured seconds use it, else estimate @ 140wpm avg learner pace
  const estimatedSeconds = elapsedSec && elapsedSec > 0 ? elapsedSec : wordCount / (140 / 60);
  const wpm = estimatedSeconds > 0.5 ? Math.round((wordCount / estimatedSeconds) * 60) : 0;
  return { wpm, wordCount, fillerCount: count, fillerWords, charCount, estimatedSeconds: Math.round(estimatedSeconds) };
}

export function cefrFromAvg(avg0to5: number): string {
  if (avg0to5 <= 0.5) return 'Pre-A1';
  if (avg0to5 < 1.5) return 'A1';
  if (avg0to5 < 2.5) return 'A2';
  if (avg0to5 < 3.5) return 'B1';
  if (avg0to5 < 4.3) return 'B2';
  return 'C1';
}

export function avgSkill(a: { fluency: number; listening: number; reflexing: number; sentenceFlexibility: number; vocabularyFlexibility: number; intonation: number; linking: number; finalSound: number; stress: number }): number {
  const vals = [a.fluency, a.listening, a.reflexing, a.sentenceFlexibility, a.vocabularyFlexibility, a.intonation, a.linking, a.finalSound, a.stress];
  const scored = vals.filter((v) => v > 0);
  if (scored.length === 0) return 0;
  return scored.reduce((s, v) => s + v, 0) / scored.length;
}

export function xpForSession(durationSec: number, turns: number, corrections: number): number {
  return Math.min(200, Math.round(durationSec / 60) * 10 + turns * 4 + corrections * 2);
}
