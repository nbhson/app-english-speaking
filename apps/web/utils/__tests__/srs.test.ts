import { describe, it, expect } from 'vitest';
import { intervalDaysFor, scheduleNextReview, isDue, dueInLabel, DAY_MS } from '../srs';

describe('srs', () => {
  it('progresses intervals 1d → 3d → 7d → 14d → 30d → 60d', () => {
    expect(intervalDaysFor(1)).toBe(1);
    expect(intervalDaysFor(2)).toBe(3);
    expect(intervalDaysFor(3)).toBe(7);
    expect(intervalDaysFor(4)).toBe(14);
    expect(intervalDaysFor(5)).toBe(30);
    expect(intervalDaysFor(6)).toBe(60);
    expect(intervalDaysFor(99)).toBe(60);
  });

  it('schedules next review in the future', () => {
    const now = Date.now();
    const next = scheduleNextReview(1, now);
    expect(next).toBe(now + DAY_MS);
  });

  it('treats missing schedule as due', () => {
    expect(isDue(undefined)).toBe(true);
    expect(isDue(Date.now() - 1000)).toBe(true);
    expect(isDue(Date.now() + DAY_MS)).toBe(false);
  });

  it('labels due states', () => {
    expect(dueInLabel(undefined)).toBe('Due now');
    expect(dueInLabel(Date.now() - 10)).toBe('Due now');
    expect(dueInLabel(Date.now() + 3 * DAY_MS)).toBe('Due in 3d');
  });
});
