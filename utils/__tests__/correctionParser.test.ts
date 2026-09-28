import { describe, it, expect } from 'vitest';
import { parseCorrectionFields, parseCorrectionBlock } from '../storage';

describe('parseCorrectionFields', () => {
  it('parses plain labels', () => {
    const out = parseCorrectionFields(
      'Original: I go yesterday.\nCorrected: I went yesterday.\nAlternative: "I went yesterday."\nExplanation: past tense.',
    );
    expect(out.original).toBe('I go yesterday.');
    expect(out.corrected).toBe('I went yesterday.');
    expect(out.alternative).toBe('I went yesterday.');
    expect(out.explanation).toBe('past tense.');
  });

  it('parses bold markdown labels', () => {
    const out = parseCorrectionFields(
      '**Original:** I want play game\n**Corrected:** I want to play games\n**Alternative:** "I feel like gaming"\n**Explanation:** verb form.',
    );
    expect(out.original).toBe('I want play game');
    expect(out.corrected).toBe('I want to play games');
    expect(out.alternative).toBe('I feel like gaming');
  });

  it('parses bullet-prefixed labels', () => {
    const out = parseCorrectionFields(
      '- Original: Yes I want to play some game\n- Corrected: Yes, I want to play some games',
    );
    expect(out.original).toBe('Yes I want to play some game');
    expect(out.corrected).toBe('Yes, I want to play some games');
  });

  it('returns null block when nothing parseable', () => {
    expect(parseCorrectionBlock('hello world')).toBeNull();
  });
});
