import { describe, it, expect } from 'vitest';
import { normalizeWords, levenshteinWords, scorePronunciation } from '../pronunciation';

describe('normalizeWords', () => {
  it('lowercases, strips punctuation, dedupes spaces', () => {
    expect(normalizeWords('Hello, World! How ARE you?')).toEqual(['hello', 'world', 'how', 'are', 'you']);
  });
  it('keeps apostrophes inside words', () => {
    expect(normalizeWords("I'm fine, thanks")).toEqual(["i'm", 'fine', 'thanks']);
  });
});

describe('levenshteinWords', () => {
  it('counts word-level edits', () => {
    expect(levenshteinWords(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
    expect(levenshteinWords(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
    expect(levenshteinWords(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe(2);
    expect(levenshteinWords([], ['x'])).toBe(1);
  });
});

describe('scorePronunciation', () => {
  it('perfect match → 100, all ok', () => {
    const r = scorePronunciation('I would like to schedule a meeting', 'i would like to schedule a meeting');
    expect(r.score).toBe(100);
    expect(r.words.every((w) => w.status === 'ok')).toBe(true);
  });

  it('missing word lowers the score and is marked missing', () => {
    const r = scorePronunciation('I would like to schedule a meeting', 'i would like to a meeting');
    expect(r.words.find((w) => w.word === 'schedule')?.status).toBe('missing');
    expect(r.score).toBeLessThan(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('substituted word is marked wrong', () => {
    const r = scorePronunciation('schedule a meeting', 'schedule a meeting');
    expect(r.score).toBe(100);
    const wrong = scorePronunciation('schedule a meeting', 'schedule the meeting');
    expect(wrong.words.find((w) => w.word === 'a')?.status).toBe('wrong');
  });

  it('empty target → score 0 without crash; empty said → all missing', () => {
    expect(scorePronunciation('', 'hello').score).toBe(0);
    const r = scorePronunciation('hello world', '');
    expect(r.words.every((w) => w.status === 'missing')).toBe(true);
    expect(r.score).toBe(0);
  });
});
