import { describe, it, expect } from 'vitest';
import { parseAssessmentBlock, sessionMetricValue } from '../assessment';

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

describe('sessionMetricValue (trend chart)', () => {
  const base = { avgScore: 4, transcript: [] as Array<{ assessment?: Record<string, number> }> };

  it('overall uses avgScore, null when missing', () => {
    expect(sessionMetricValue(base, 'overall')).toBe(4);
    expect(sessionMetricValue({ ...base, avgScore: NaN }, 'overall')).toBeNull();
    expect(sessionMetricValue({ ...base, avgScore: 0 }, 'overall')).toBeNull();
  });

  it('skill uses the LAST assessment entry carrying that skill', () => {
    const s = {
      avgScore: 4,
      transcript: [
        { assessment: { fluency: 2, linking: 3 } },
        { assessment: { fluency: 4 } }, // latest wins
        {},
      ],
    };
    expect(sessionMetricValue(s, 'fluency')).toBe(4);
    expect(sessionMetricValue(s, 'linking')).toBe(3);
  });

  it('returns null when no transcript entry has the skill', () => {
    expect(sessionMetricValue(base, 'stress')).toBeNull();
  });
});
