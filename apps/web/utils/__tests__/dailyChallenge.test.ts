import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDailyChallenge, isDailyDone, markDailyDone, DAILY_BONUS_XP } from '../dailyChallenge';

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

vi.stubGlobal('localStorage', localStorageMock);

describe('dailyChallenge', () => {
  beforeEach(() => {
    store.clear();
  });

  it('same date → same deterministic challenge', () => {
    const d = new Date('2026-03-15T10:00:00');
    const a = getDailyChallenge(d);
    const b = getDailyChallenge(d);
    expect(a).toEqual(b);
    expect(a.date).toBe('2026-03-15');
    expect(a.bonusXP).toBe(DAILY_BONUS_XP);
  });

  it('different dates → (almost surely) different template', () => {
    const keys = new Set(
      Array.from({ length: 30 }, (_, i) => {
        const d = new Date(2026, 2, 1 + i);
        return getDailyChallenge(d).title;
      }),
    );
    // 12 templates — 30 ngày phải dùng tới nhiều hơn 1 template
    expect(keys.size).toBeGreaterThan(1);
  });

  it('markDailyDone / isDailyDone roundtrip', () => {
    expect(isDailyDone(new Date('2026-03-15T10:00:00'))).toBe(false);
    markDailyDone(new Date('2026-03-15T10:00:00'));
    expect(isDailyDone(new Date('2026-03-15T23:00:00'))).toBe(true);
    expect(isDailyDone(new Date('2026-03-16T09:00:00'))).toBe(false);
  });
});
