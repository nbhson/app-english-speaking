import type { SessionAssessment } from '../types';

export const INITIAL_ASSESSMENT: SessionAssessment = {
  fluency: 0,
  listening: 0,
  reflexing: 0,
  sentenceFlexibility: 0,
  vocabularyFlexibility: 0,
  intonation: 0,
  linking: 0,
  finalSound: 0,
  stress: 0,
  vocabularyPoints: 0,
  confidenceLevel: 0,
  insight: '',
};

export function parseAssessmentBlock(content: string): Partial<SessionAssessment> {
  const out: Partial<SessionAssessment> = {};
  content.split('\n').forEach((line) => {
    const [rawKey, rawVal] = line.split(':').map((s) => s.trim());
    if (!rawKey || !rawVal) return;
    const score = parseInt(rawVal, 10);
    if (Number.isNaN(score)) return;
    const k = rawKey.toLowerCase();
    if (k.includes('fluency')) out.fluency = score;
    else if (k.includes('listening')) out.listening = score;
    else if (k.includes('reflex')) out.reflexing = score;
    else if (k.includes('sentence flexibility')) out.sentenceFlexibility = score;
    else if (k.includes('vocabulary flexibility')) out.vocabularyFlexibility = score;
    else if (k.includes('intonation')) out.intonation = score;
    else if (k.includes('linking')) out.linking = score;
    else if (k.includes('final sound')) out.finalSound = score;
    else if (k.includes('stress')) out.stress = score;
    else if (k.includes('vocabulary point')) out.vocabularyPoints = score;
    else if (k.includes('confidence')) out.confidenceLevel = score;
  });
  return out;
}

export function deriveInsight(a: SessionAssessment): string {
  const skills: [string, number][] = [
    ['Fluency', a.fluency],
    ['Listening', a.listening],
    ['Reflexing', a.reflexing],
    ['Sentence Flexibility', a.sentenceFlexibility],
    ['Vocabulary Flexibility', a.vocabularyFlexibility],
    ['Intonation', a.intonation],
    ['Linking', a.linking],
    ['Final Sound', a.finalSound],
    ['Stress', a.stress],
  ];
  const scored = skills.filter(([, v]) => v > 0);
  if (scored.length === 0) return '';
  const sorted = [...scored].sort((x, y) => y[1] - x[1]);
  const [strongLabel, strong] = sorted[0];
  const [weakLabel, weak] = sorted[sorted.length - 1];
  return strong === weak
    ? `You're consistently at ${strong}/5 across the board. Keep practicing — small daily sessions will push you to the next level.`
    : `💪 Strongest: ${strongLabel} (${strong}/5). 🎯 Focus: ${weakLabel} (${weak}/5) — the biggest gain is waiting there.`;
}
