import { describe, it, expect } from 'vitest';
import { parseAssessmentBlock } from '../assessment';

describe('parseAssessmentBlock', () => {
  it('parses all skills', () => {
    const out = parseAssessmentBlock([
      'Fluency: 4', 'Listening: 3', 'Reflexing: 4', 'Sentence Flexibility: 3',
      'Vocabulary Flexibility: 3', 'Intonation: 3', 'Linking: 2', 'Final Sound: 3',
      'Stress: 3', 'Vocabulary Points: 70', 'Confidence: 80',
    ].join('\n'));
    expect(out.fluency).toBe(4);
    expect(out.linking).toBe(2);
    expect(out.vocabularyPoints).toBe(70);
    expect(out.confidenceLevel).toBe(80);
  });

  it('ignores garbage lines', () => {
    expect(parseAssessmentBlock('hello\nFluency: x\nFluency: 5')).toEqual({ fluency: 5 });
  });
});
