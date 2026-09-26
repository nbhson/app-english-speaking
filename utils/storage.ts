// Persistence layer: session history, mistake notebook, vocab notebook,
// streak/XP progress, multi-profile AI configs. All localStorage-based.

import type { AIConfig } from './api';
import { DEFAULT_CONFIG } from './api';
import type { AppMode, MistakeEntry, ProgressDay, SessionRecord, TranscriptionEntry, VocabEntry } from '../types';

const K = {
  sessions: 'fluentdev-sessions-v1',
  mistakes: 'fluentdev-mistakes-v1',
  vocab: 'fluentdev-vocab-v1',
  progress: 'fluentdev-progress-v1',
  profiles: 'fluentdev-profiles-v1',
  activeProfile: 'fluentdev-active-profile-v1',
  streak: 'fluentdev-streak-v1',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota ignore */
  }
}

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
export const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);

// --- Sessions ---
export function getSessions(): SessionRecord[] {
  return read<SessionRecord[]>(K.sessions, []);
}

export function saveSession(rec: SessionRecord): SessionRecord[] {
  const all = [rec, ...getSessions()].slice(0, 100);
  write(K.sessions, all);
  return all;
}

export function clearSessions(): void {
  write(K.sessions, []);
}

export function transcriptToMarkdown(transcript: TranscriptionEntry[], mode: string): string {
  const lines = [`# FluentDev session — ${mode}`, '', ...transcript.map((t) =>
    t.role === 'user' ? `**You:** ${t.text}${t.suggestion ? `\n> 💡 ${t.suggestion}` : ''}` : `**Coach:** ${t.text}`,
  )];
  return lines.join('\n\n');
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --- Mistakes (from [Correction] blocks) ---
export function getMistakes(): MistakeEntry[] {
  return read<MistakeEntry[]>(K.mistakes, []);
}

export function addMistake(m: Omit<MistakeEntry, 'id' | 'createdAt' | 'reviewCount'>): MistakeEntry[] {
  const entry: MistakeEntry = { ...m, id: uid(), createdAt: Date.now(), reviewCount: 0 };
  // de-dupe by original text
  const all = getMistakes();
  if (all.some((x) => x.original.toLowerCase() === entry.original.toLowerCase())) return all;
  const next = [entry, ...all].slice(0, 300);
  write(K.mistakes, next);
  return next;
}

export function markMistakeReviewed(id: string, mastered?: boolean): MistakeEntry[] {
  const next = getMistakes().map((m) =>
    m.id === id ? { ...m, reviewCount: m.reviewCount + 1, mastered: mastered ?? m.mastered } : m,
  );
  write(K.mistakes, next);
  return next;
}

export function deleteMistake(id: string): MistakeEntry[] {
  const next = getMistakes().filter((m) => m.id !== id);
  write(K.mistakes, next);
  return next;
}

// --- Vocab notebook ---
export function getVocab(): VocabEntry[] {
  return read<VocabEntry[]>(K.vocab, []);
}

export function saveVocab(v: Omit<VocabEntry, 'id' | 'createdAt' | 'reviewCount'>): VocabEntry[] {
  const all = getVocab();
  if (all.some((x) => x.word.toLowerCase() === v.word.toLowerCase())) return all;
  const entry: VocabEntry = { ...v, id: uid(), createdAt: Date.now(), reviewCount: 0 };
  const next = [entry, ...all].slice(0, 500);
  write(K.vocab, next);
  return next;
}

export function deleteVocab(id: string): VocabEntry[] {
  const next = getVocab().filter((v) => v.id !== id);
  write(K.vocab, next);
  return next;
}

// --- Progress / streak / XP ---
export function getProgress(): ProgressDay[] {
  return read<ProgressDay[]>(K.progress, []);
}

export function logSessionProgress(durationSec: number, xp: number): { days: ProgressDay[]; streak: number } {
  const key = todayKey();
  const days = getProgress();
  const idx = days.findIndex((d) => d.date === key);
  if (idx >= 0) {
    days[idx] = { ...days[idx], sessions: days[idx].sessions + 1, minutes: days[idx].minutes + Math.round(durationSec / 60), xp: days[idx].xp + xp };
  } else {
    days.unshift({ date: key, sessions: 1, minutes: Math.round(durationSec / 60), xp });
  }
  write(K.progress, days.slice(0, 90));
  const streak = calcStreak(days);
  write(K.streak, { streak, updatedAt: Date.now() });
  return { days, streak };
}

export function calcStreak(days: ProgressDay[]): number {
  if (days.length === 0) return 0;
  const set = new Set(days.map((d) => d.date));
  let streak = 0;
  const cur = new Date();
  // allow today missing -> start from yesterday
  if (!set.has(todayKey(cur))) cur.setDate(cur.getDate() - 1);
  while (set.has(todayKey(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export function getStreak(): number {
  const days = getProgress();
  return calcStreak(days);
}

export function totalXP(): number {
  return getProgress().reduce((s, d) => s + d.xp, 0);
}

// --- Multi-profile configs ---
export interface NamedProfile {
  id: string;
  name: string;
  config: AIConfig;
}

export function getProfiles(): NamedProfile[] {
  const stored = read<NamedProfile[]>(K.profiles, []);
  if (stored.length > 0) return stored;
  // seed from current single config
  try {
    const raw = localStorage.getItem('fluentdev-ai-config');
    const cfg = raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
    return [{ id: 'default', name: 'Default', config: cfg }];
  } catch {
    return [{ id: 'default', name: 'Default', config: { ...DEFAULT_CONFIG } }];
  }
}

export function saveProfiles(profiles: NamedProfile[], activeId: string): void {
  write(K.profiles, profiles);
  write(K.activeProfile, activeId);
  const active = profiles.find((p) => p.id === activeId);
  if (active) {
    try {
      localStorage.setItem('fluentdev-ai-config', JSON.stringify(active.config));
    } catch { /* ignore */ }
  }
}

export function getActiveProfileId(): string {
  try {
    return localStorage.getItem(K.activeProfile) || 'default';
  } catch {
    return 'default';
  }
}

export function parseCorrectionBlock(content: string): { original: string; corrected: string; alternative: string; explanation: string } | null {
  const get = (label: string) => {
    const m = content.match(new RegExp(`${label}:\\s*(.*)`, 'i'));
    return m ? m[1].trim().replace(/^"|"$/g, '') : '';
  };
  const original = get('Original');
  const corrected = get('Corrected');
  if (!original && !corrected) return null;
  return { original, corrected, alternative: get('Alternative'), explanation: get('Explanation') };
}

export type { AppMode };
