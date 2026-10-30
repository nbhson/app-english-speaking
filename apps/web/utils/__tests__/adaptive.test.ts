import { describe, it, expect } from 'vitest';
import { suggestDifficulty } from '../adaptive';
import type { SessionRecord } from '../../types';

const mkSession = (avgScore: number, startedAt: number): SessionRecord =>
  ({
    id: `s${startedAt}`,
    mode: 'daily',
    startedAt,
    endedAt: startedAt,
    durationSec: 300,
    turns: 5,
    corrections: 2,
    avgScore,
    vocabPoints: 50,
    confidence: 60,
    transcript: [],
  }) as SessionRecord;

const now = 1_800_000_000_000;

describe('suggestDifficulty', () => {
  it('needs at least 3 scored sessions', () => {
    expect(suggestDifficulty([], 'intermediate')).toBeNull();
    expect(suggestDifficulty([mkSession(5, now)], 'intermediate')).toBeNull();
  });

  it('suggests upgrade when last 3 sessions average high', () => {
    const sessions = [mkSession(4.6, now), mkSession(4.5, now - 1), mkSession(4.4, now - 2), mkSession(1, now - 3)];
    // session cũ (1 điểm) ngoài cửa sổ 3 buổi gần nhất
    expect(suggestDifficulty(sessions, 'beginner')).toBe('intermediate');
    expect(suggestDifficulty(sessions, 'intermediate')).toBe('advanced');
  });

  it('stays null at the ceiling / floor', () => {
    const high = [mkSession(5, now), mkSession(5, now - 1), mkSession(5, now - 2)];
    expect(suggestDifficulty(high, 'advanced')).toBeNull();
    const low = [mkSession(1.5, now), mkSession(2, now - 1), mkSession(2.2, now - 2)];
    expect(suggestDifficulty(low, 'beginner')).toBeNull();
  });

  it('suggests downgrade when struggling', () => {
    const low = [mkSession(2, now), mkSession(1.8, now - 1), mkSession(2.2, now - 2)];
    expect(suggestDifficulty(low, 'advanced')).toBe('intermediate');
    expect(suggestDifficulty(low, 'intermediate')).toBe('beginner');
  });

  it('ignores unscored sessions in the window', () => {
    const mixed = [mkSession(0, now), mkSession(4.6, now - 1), mkSession(4.5, now - 2), mkSession(4.6, now - 3)];
    expect(suggestDifficulty(mixed, 'intermediate')).toBe('advanced');
  });

  it('mid-range scores suggest nothing', () => {
    const mid = [mkSession(3.5, now), mkSession(3.8, now - 1), mkSession(3.6, now - 2)];
    expect(suggestDifficulty(mid, 'intermediate')).toBeNull();
  });
});
