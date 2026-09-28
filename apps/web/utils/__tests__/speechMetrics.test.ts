import { describe, it, expect } from 'vitest';
import { analyzeSpeech, cefrFromAvg, xpForSession } from '../speechMetrics';

describe('analyzeSpeech', () => {
  it('computes wpm + fillers', () => {
    const m = analyzeSpeech('I uh think like this is actually good', 30);
    expect(m.wordCount).toBe(8);
    expect(m.fillerCount).toBeGreaterThanOrEqual(3);
    expect(m.wpm).toBe(16);
  });
});

describe('cefr', () => {
  it('maps bands', () => {
    expect(cefrFromAvg(0)).toBe('Pre-A1');
    expect(cefrFromAvg(2)).toBe('A2');
    expect(cefrFromAvg(3)).toBe('B1');
    expect(cefrFromAvg(4)).toBe('B2');
    expect(cefrFromAvg(5)).toBe('C1');
  });
});

describe('xp', () => {
  it('caps at 200', () => {
    expect(xpForSession(3600, 100, 50)).toBeLessThanOrEqual(200);
    expect(xpForSession(120, 5, 1)).toBeGreaterThan(0);
  });
});
