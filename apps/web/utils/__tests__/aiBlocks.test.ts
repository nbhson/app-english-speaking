import { describe, it, expect } from 'vitest';
import {
  stripAiBlocks,
  extractBlock,
  extractBlocks,
  extractCorrectionSuggestion,
  AI_BLOCK_KEYS,
} from '../aiBlocks';

describe('stripAiBlocks', () => {
  it('removes every block type and keeps spoken text', () => {
    const input = [
      'Good point about deadlines.',
      '[Correction]',
      'Original: I go yesterday.',
      'Corrected: I went yesterday.',
      '[/Correction]',
      '[Assessment]',
      'Fluency: 4',
      '[/Assessment]',
      '[Insight]',
      'Nice linking!',
      '[/Insight]',
      'One more question?',
    ].join('\n');
    const out = stripAiBlocks(input);
    expect(out).toContain('Good point about deadlines.');
    expect(out).toContain('One more question?');
    expect(out).not.toContain('Fluency');
    expect(out).not.toContain('Original');
    expect(out).not.toContain('[Corrected');
    expect(out).not.toContain('[Insight]');
  });

  it('leaves text without blocks untouched', () => {
    const text = 'Just a plain coach reply.';
    expect(stripAiBlocks(text)).toBe(text);
  });
});

describe('extractBlock / extractBlocks', () => {
  it('extracts single and multiple blocks', () => {
    const text = 'a [Correction] x: 1 [/Correction] b [Correction] y: 2 [/Correction]';
    expect(extractBlocks(text, 'Correction')).toEqual([' x: 1 ', ' y: 2 ']);
    expect(extractBlock(text, 'Correction')).toBe(' x: 1 ');
    expect(extractBlock('no block', 'Insight')).toBeNull();
  });

  it('exposes the known block keys', () => {
    expect(AI_BLOCK_KEYS).toEqual(['Correction', 'Assessment', 'Insight']);
  });
});

describe('extractCorrectionSuggestion', () => {
  it('prefers Alternative inside a correction block', () => {
    const full = 'talk talk\n[Correction]\nOriginal: A\nCorrected: B\nAlternative: "I feel like gaming"\n[/Correction]';
    expect(extractCorrectionSuggestion(full)).toBe('I feel like gaming');
  });

  it('falls back to labelled phrasing outside blocks', () => {
    const full = 'Nice.\nBetter alternative: we shipped on time.';
    expect(extractCorrectionSuggestion(full)).toBe('we shipped on time.');
  });

  it('returns undefined when nothing matches', () => {
    expect(extractCorrectionSuggestion('plain reply')).toBeUndefined();
  });
});
