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

// ---------- offline retry queue (persisted, flushed when server is back) ----------
interface PendingOp {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  ts: number;
}

const QUEUE_KEY = 'fluentdev-pending-queue-v1';
const MAX_QUEUE = 200;

function readQueue(): PendingOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeQueue(q: PendingOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(0, MAX_QUEUE)));
  } catch {
    /* quota ignore */
  }
}

export function pendingCount(): number {
  try {
    return readQueue().length;
  } catch {
    return 0;
  }
}

function enqueue(op: Omit<PendingOp, 'id' | 'ts'>): void {
  const q = readQueue();
  q.push({ ...op, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, ts: Date.now() });
  writeQueue(q);
}

async function sendOp(op: PendingOp): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}${op.path}`, {
      method: op.method,
      headers: { 'Content-Type': 'application/json' },
      body: op.body === undefined ? undefined : JSON.stringify(op.body),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Try to flush queued writes. Returns number of ops successfully sent. */
export async function flushPendingQueue(): Promise<number> {
  if (!(await serverAvailable())) return 0;
  const q = readQueue();
  if (q.length === 0) return 0;
  let sent = 0;
  const remaining: PendingOp[] = [];
  for (const op of q) {
    const ok = await sendOp(op);
    if (ok) sent++;
    else remaining.push(op);
  }
  writeQueue(remaining);
  return sent;
}

function mirrorOrQueue(op: Omit<PendingOp, 'id' | 'ts'>): void {
  void serverAvailable().then(async (ok) => {
    if (!ok) {
      enqueue(op);
      return;
    }
    // Flush old queue first (best-effort), then current op
    try {
      await flushPendingQueue();
    } catch {
      /* ignore */
    }
    const sent = await sendOp({ ...op, id: '', ts: 0 });
    if (!sent) enqueue(op);
  });
}

// ---------- fire-and-forget mirrors (local already written by callers) ----------
export function mirrorSession(rec: SessionRecord): void {
  mirrorOrQueue({ method: 'POST', path: '/api/sessions', body: rec });
}

export function mirrorMistake(m: {
  original: string;
  corrected: string;
  alternative: string;
  explanation: string;
  mode: string;
}): void {
  mirrorOrQueue({ method: 'POST', path: '/api/mistakes', body: m });
}

export function mirrorMistakeReviewed(id: string, mastered?: boolean): void {
  mirrorOrQueue({
    method: 'PATCH',
    path: `/api/mistakes/${id}`,
    body: mastered === true ? { mastered: true } : { reviewed: true },
  });
}

export function mirrorDeleteMistake(id: string): void {
  mirrorOrQueue({ method: 'DELETE', path: `/api/mistakes/${id}` });
}

export function mirrorVocab(v: { word: string; translation: string; ipa: string; example: string }): void {
  mirrorOrQueue({ method: 'POST', path: '/api/vocab', body: v });
}

export function mirrorDeleteVocab(id: string): void {
  mirrorOrQueue({ method: 'DELETE', path: `/api/vocab/${id}` });
}

export function mirrorClearSessions(): void {
  mirrorOrQueue({ method: 'DELETE', path: '/api/sessions' });
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
      if (r.ok) {
        const remote = (await r.json()) as MistakeEntry[];
        // SRS schedule is local-only (server schema has no nextReview) — merge it back.
        const local = getMistakes();
        const byOriginal = new Map(local.map((m) => [m.original.toLowerCase(), m]));
        const byId = new Map(local.map((m) => [m.id, m]));
        return {
          list: remote.map((m) => {
            const l = byId.get(m.id) ?? byOriginal.get(m.original.toLowerCase());
            return l ? { ...m, nextReview: l.nextReview, lastReviewedAt: l.lastReviewedAt } : m;
          }),
          remote: true,
        };
      }
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
      if (r.ok) {
        const remote = (await r.json()) as VocabEntry[];
        const local = getVocab();
        const byWord = new Map(local.map((v) => [v.word.toLowerCase(), v]));
        const byId = new Map(local.map((v) => [v.id, v]));
        return {
          list: remote.map((v) => {
            const l = byId.get(v.id) ?? byWord.get(v.word.toLowerCase());
            return l ? { ...v, nextReview: l.nextReview, lastReviewedAt: l.lastReviewedAt } : v;
          }),
          remote: true,
        };
      }
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
