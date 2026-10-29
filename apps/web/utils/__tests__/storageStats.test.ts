import { describe, it, expect } from 'vitest';
import { bestStreak, last7DaysStats, minutesThisWeek, startOfWeek } from '../storage';
import type { ProgressDay } from '../../types';

const day = (date: string, minutes = 10, sessions = 1, xp = 20): ProgressDay => ({ date, minutes, sessions, xp });

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
