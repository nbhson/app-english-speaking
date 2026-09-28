// Remote Library store — talks to apps/server (SQLite) when it's running,
// falls back to localStorage otherwise. Writes are write-through:
// local first (instant UI), then mirrored to the server fire-and-forget.

import type {
  MistakeEntry,
  ProgressDay,
  SessionRecord,
  VocabEntry,
} from '../types';
import {
  getSessions,
  getMistakes,
  getVocab,
  getProgress,
} from './storage';

const BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_LIBRARY_API ||
  'http://localhost:8241';

let available: boolean | null = null;
let availableAt = 0;

export async function serverAvailable(): Promise<boolean> {
  if (available !== null && Date.now() - availableAt < 15000) return available;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(`${BASE}/api/health`, { signal: ctl.signal });
    clearTimeout(t);
    available = r.ok;
  } catch {
    available = false;
  }
  availableAt = Date.now();
  return available;
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------- fire-and-forget mirrors (local already written by callers) ----------
export function mirrorSession(rec: SessionRecord): void {
  void serverAvailable().then((ok) => {
    if (ok) post('/api/sessions', rec).catch(() => {});
  });
}

export function mirrorMistake(m: {
  original: string;
  corrected: string;
  alternative: string;
  explanation: string;
  mode: string;
}): void {
  void serverAvailable().then((ok) => {
    if (ok) post('/api/mistakes', m).catch(() => {});
  });
}

export function mirrorMistakeReviewed(id: string, mastered?: boolean): void {
  void serverAvailable().then((ok) => {
    if (ok)
      fetch(`${BASE}/api/mistakes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mastered === true ? { mastered: true } : { reviewed: true }),
      }).catch(() => {});
  });
}

export function mirrorDeleteMistake(id: string): void {
  void serverAvailable().then((ok) => {
    if (ok) fetch(`${BASE}/api/mistakes/${id}`, { method: 'DELETE' }).catch(() => {});
  });
}

export function mirrorVocab(v: { word: string; translation: string; ipa: string; example: string }): void {
  void serverAvailable().then((ok) => {
    if (ok) post('/api/vocab', v).catch(() => {});
  });
}

export function mirrorDeleteVocab(id: string): void {
  void serverAvailable().then((ok) => {
    if (ok) fetch(`${BASE}/api/vocab/${id}`, { method: 'DELETE' }).catch(() => {});
  });
}

export function mirrorClearSessions(): void {
  void serverAvailable().then((ok) => {
    if (ok) fetch(`${BASE}/api/sessions`, { method: 'DELETE' }).catch(() => {});
  });
}

export function mirrorProgress(durationSec: number, xp: number): Promise<number | null> {
  return serverAvailable().then((ok) => {
    if (!ok) return null;
    return post('/api/progress/log', { durationSec, xp })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (typeof j?.streak === 'number' ? (j.streak as number) : null))
      .catch(() => null);
  });
}

// ---------- remote-first readers (fallback to local) ----------
export async function fetchSessions(): Promise<{ list: SessionRecord[]; remote: boolean }> {
  if (await serverAvailable()) {
    try {
      const r = await fetch(`${BASE}/api/sessions?limit=100`);
      if (r.ok) return { list: (await r.json()) as SessionRecord[], remote: true };
    } catch {
      /* fall through */
    }
  }
  return { list: getSessions(), remote: false };
}

export async function fetchMistakes(): Promise<{ list: MistakeEntry[]; remote: boolean }> {
  if (await serverAvailable()) {
    try {
      const r = await fetch(`${BASE}/api/mistakes`);
      if (r.ok) return { list: (await r.json()) as MistakeEntry[], remote: true };
    } catch {
      /* fall through */
    }
  }
  return { list: getMistakes(), remote: false };
}

export async function fetchVocab(): Promise<{ list: VocabEntry[]; remote: boolean }> {
  if (await serverAvailable()) {
    try {
      const r = await fetch(`${BASE}/api/vocab`);
      if (r.ok) return { list: (await r.json()) as VocabEntry[], remote: true };
    } catch {
      /* fall through */
    }
  }
  return { list: getVocab(), remote: false };
}

export async function fetchProgress(): Promise<{ list: ProgressDay[]; remote: boolean }> {
  if (await serverAvailable()) {
    try {
      const r = await fetch(`${BASE}/api/progress`);
      if (r.ok) return { list: (await r.json()) as ProgressDay[], remote: true };
    } catch {
      /* fall through */
    }
  }
  return { list: getProgress(), remote: false };
}

// One-time migration: push localStorage data into an empty server DB.
export async function migrateLocalToServer(): Promise<boolean> {
  if (!(await serverAvailable())) return false;
  try {
    const [sessions, mistakes, vocab] = await Promise.all([
      fetch(`${BASE}/api/sessions?limit=1`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${BASE}/api/mistakes`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${BASE}/api/vocab`).then((r) => (r.ok ? r.json() : [])),
    ]);
    if (sessions.length > 0 || mistakes.length > 0 || vocab.length > 0) return false;
    const localSessions = getSessions();
    const localMistakes = getMistakes();
    const localVocab = getVocab();
    if (localSessions.length === 0 && localMistakes.length === 0 && localVocab.length === 0) {
      return false;
    }
    await Promise.all([
      ...localSessions.map((s) => post('/api/sessions', s).catch(() => {})),
      ...localMistakes.map((m) =>
        post('/api/mistakes', {
          original: m.original,
          corrected: m.corrected,
          alternative: m.alternative,
          explanation: m.explanation,
          mode: m.mode,
        }).catch(() => {}),
      ),
      ...localVocab.map((v) =>
        post('/api/vocab', {
          word: v.word,
          translation: v.translation,
          ipa: v.ipa,
          example: v.example,
        }).catch(() => {}),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}
