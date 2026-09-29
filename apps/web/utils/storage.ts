// Persistence layer: session history, mistake notebook, vocab notebook,
// streak/XP progress, multi-profile AI configs. All localStorage-based.

import type { AIConfig } from './api';
import { DEFAULT_CONFIG } from './api';
import { scheduleNextReview } from './srs';
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
  const now = Date.now();
  const next = getMistakes().map((m) => {
    if (m.id !== id) return m;
    const reviewCount = m.reviewCount + 1;
    return {
      ...m,
      reviewCount,
      mastered: mastered ?? m.mastered,
      lastReviewedAt: now,
      // Mastered items leave the SRS queue far in the future; others follow SM-2 lite steps.
      nextReview: mastered === true ? now + 365 * 24 * 60 * 60 * 1000 : scheduleNextReview(reviewCount, now),
    };
  });
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

export function markVocabReviewed(id: string): VocabEntry[] {
  const now = Date.now();
  const next = getVocab().map((v) =>
    v.id === id
      ? { ...v, reviewCount: v.reviewCount + 1, lastReviewedAt: now, nextReview: scheduleNextReview(v.reviewCount + 1, now) }
      : v,
  );
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

export function cleanCorrectionValue(v: string): string {
  return v.trim().replace(/^\*\*|\*\*$/g, '').replace(/^"|"$/g, '').replace(/^_([^_]+)_$/, '$1').trim();
}

function normalizeCorrectionLine(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*•>]|\d+[.)])\s+/, '')
    .replace(/^\*\*([^*:]+?)\s*:?\s*\*\*:?\s*/, '$1: ')
    .replace(/^__([^_:]+?)\s*:?\s*__:?\s*/, '$1: ')
    .trim();
}

export function parseCorrectionFields(content: string): { original: string; corrected: string; alternative: string; explanation: string } {
  const out = { original: '', corrected: '', alternative: '', explanation: '' };
  for (const raw of content.split('\n')) {
    const line = normalizeCorrectionLine(raw);
    const m = line.match(/^(original|corrected|alternative|explanation)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase() as keyof typeof out;
    if (!out[key]) out[key] = cleanCorrectionValue(m[2]);
  }
  return out;
}

export function parseCorrectionBlock(content: string): { original: string; corrected: string; alternative: string; explanation: string } | null {
  const { original, corrected, alternative, explanation } = parseCorrectionFields(content);
  if (!original && !corrected) return null;
  return { original, corrected, alternative, explanation };
}

// --- Full Library backup (export/import JSON) ---
export interface LibraryBackup {
  version: 1;
  exportedAt: number;
  sessions: SessionRecord[];
  mistakes: MistakeEntry[];
  vocab: VocabEntry[];
  progress: ProgressDay[];
}

export function exportLibrary(): string {
  const backup: LibraryBackup = {
    version: 1,
    exportedAt: Date.now(),
    sessions: getSessions(),
    mistakes: getMistakes(),
    vocab: getVocab(),
    progress: getProgress(),
  };
  return JSON.stringify(backup, null, 2);
}

function dedupeBy<T>(list: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function importLibrary(json: string): { sessions: number; mistakes: number; vocab: number; progress: number } {
  const parsed = JSON.parse(json) as Partial<LibraryBackup>;
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup file');
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const mistakes = Array.isArray(parsed.mistakes) ? parsed.mistakes : [];
  const vocab = Array.isArray(parsed.vocab) ? parsed.vocab : [];
  const progress = Array.isArray(parsed.progress) ? parsed.progress : [];

  const mergedSessions = dedupeBy(
    [...sessions, ...getSessions()].filter((s) => s && typeof s.id === 'string'),
    (s) => s.id,
  ).slice(0, 100);
  const mergedMistakes = dedupeBy(
    [...mistakes, ...getMistakes()].filter((m) => m && typeof m.original === 'string'),
    (m) => m.original.toLowerCase(),
  ).slice(0, 300);
  const mergedVocab = dedupeBy(
    [...vocab, ...getVocab()].filter((v) => v && typeof v.word === 'string'),
    (v) => v.word.toLowerCase(),
  ).slice(0, 500);
  const mergedProgress = dedupeBy(
    [...progress, ...getProgress()].filter((d) => d && typeof d.date === 'string'),
    (d) => d.date,
  )
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 90);

  write(K.sessions, mergedSessions);
  write(K.mistakes, mergedMistakes);
  write(K.vocab, mergedVocab);
  write(K.progress, mergedProgress);
  return {
    sessions: mergedSessions.length,
    mistakes: mergedMistakes.length,
    vocab: mergedVocab.length,
    progress: mergedProgress.length,
  };
}

// --- Anki-friendly TSV export (mistakes + vocab) ---
export function exportAnkiTSV(): string {
  const lines = ['#separator:tab', '#html:false'];
  for (const m of getMistakes()) {
    const front = (m.original || '').replace(/\t|\n/g, ' ');
    const back = `${m.corrected || ''} — ${m.explanation || m.alternative || ''}`.replace(/\t|\n/g, ' ').trim();
    if (front) lines.push(`${front}\t${back}`);
  }
  for (const v of getVocab()) {
    const front = (v.word || '').replace(/\t|\n/g, ' ');
    const back = `${v.translation || ''} ${v.ipa || ''} — ${v.example || ''}`.replace(/\t|\n/g, ' ').trim();
    if (front) lines.push(`${front}\t${back}`);
  }
  return lines.join('\n');
}

export type { AppMode };
