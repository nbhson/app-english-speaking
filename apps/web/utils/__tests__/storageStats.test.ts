import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bestStreak, last7DaysStats, minutesThisWeek, startOfWeek, setWeeklyGoalMinutes, getWeeklyGoalMinutes } from '../storage';
import type { ProgressDay } from '../../types';

const day = (date: string, minutes = 10, sessions = 1, xp = 20): ProgressDay => ({ date, minutes, sessions, xp });

// storage.ts reads/writes localStorage — node test env gets a minimal in-memory stub.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

beforeEach(() => store.clear());

describe('startOfWeek', () => {
  it('returns the Monday 00:00 of the same week', () => {
    // 2026-10-29 is a Thursday
    const monday = startOfWeek(new Date(2026, 9, 29));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(26);
    expect(monday.getHours()).toBe(0);
    expect(monday.getMinutes()).toBe(0);
  });
});

describe('minutesThisWeek', () => {
  it('counts only days from Monday of the current week', () => {
    const days = [day('2026-10-26', 30), day('2026-10-29', 20), day('2026-10-25', 999), day('2026-10-19', 999)];
    const total = minutesThisWeek(days, new Date(2026, 9, 29));
    expect(total).toBe(50);
  });
});

describe('last7DaysStats', () => {
  it('sums a rolling 7-day window including today, ignoring older days', () => {
    const days = [
      day('2026-10-29', 10, 1, 5),
      day('2026-10-28', 20, 2, 10),
      day('2026-10-22', 100, 9, 99), // 8 days back → excluded
    ];
    const s = last7DaysStats(days, new Date(2026, 9, 29));
    expect(s).toEqual({ minutes: 30, sessions: 3, xp: 15 });
  });
});

describe('bestStreak', () => {
  it('finds the longest consecutive run regardless of order', () => {
    const days = [
      day('2026-10-29'),
      day('2026-10-28'),
      day('2026-10-27'),
      day('2026-10-25'), // gap on 26 → run of 1
      day('2026-10-24'),
    ];
    expect(bestStreak(days)).toBe(3);
  });

  it('returns 0 for empty history', () => {
    expect(bestStreak([])).toBe(0);
  });

  it('handles single day and unsorted input', () => {
    expect(bestStreak([day('2026-01-05'), day('2026-01-06'), day('2026-01-03')])).toBe(2);
  });
});

describe('weekly goal (F1)', () => {
  it('clamps out-of-range values to 30..3000', () => {
    setWeeklyGoalMinutes(5);
    expect(getWeeklyGoalMinutes()).toBe(30);
    setWeeklyGoalMinutes(99_999);
    expect(getWeeklyGoalMinutes()).toBe(3000);
    setWeeklyGoalMinutes(200);
    expect(getWeeklyGoalMinutes()).toBe(200);
  });

  it('falls back to the default on NaN/garbage input', () => {
    setWeeklyGoalMinutes(Number.NaN);
    expect(getWeeklyGoalMinutes()).toBeGreaterThanOrEqual(30);
  });
});

describe('countDueReviews (F6)', () => {
  it('counts un-mastered due mistakes + due vocab, excludes future reviews', async () => {
    store.clear();
    store.set(
      'fluentdev-mistakes-v1',
      JSON.stringify([
        { id: 'm1', original: 'a', corrected: 'b', createdAt: 1, reviewCount: 0, nextReview: Date.now() - 1000 },
        { id: 'm2', original: 'b', corrected: 'c', createdAt: 2, reviewCount: 1, nextReview: Date.now() + 86_400_000 },
        { id: 'm3', original: 'c', corrected: 'd', createdAt: 3, reviewCount: 5, mastered: true, nextReview: Date.now() - 5000 },
      ]),
    );
    store.set(
      'fluentdev-vocab-v1',
      JSON.stringify([
        { id: 'v1', word: 'hello', createdAt: 1, reviewCount: 0 },
        { id: 'v2', word: 'x', translation: '', createdAt: 2, reviewCount: 0, nextReview: Date.now() + 3_600_000 },
      ]),
    );
    const { countDueReviews } = await import('../storage');
    const due = countDueReviews();
    expect(due.mistakes).toBe(1);
    expect(due.vocab).toBe(1);
    expect(due.total).toBe(2);
  });
});
