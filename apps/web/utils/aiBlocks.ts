// Single source of truth for the machine-parsable AI blocks the model emits:
//   [Correction]...[/Correction], [Assessment]...[/Assessment], [Insight]...[/Insight]
// The format is declared in constants.ts (SYSTEM_INSTRUCTION). Everything that
// needs to strip, extract or parse these blocks must go through this module
// (TTS cleanup, transcript rendering, persisting, assessment updates).

import type { Correction } from '../types';

export const AI_BLOCK_KEYS = ['Correction', 'Assessment', 'Insight'] as const;
export type AIBlockKey = (typeof AI_BLOCK_KEYS)[number];

const blockRegex = (key: AIBlockKey, flags = ''): RegExp =>
  new RegExp(`\\[${key}\\]([\\s\\S]*?)\\[\\/${key}\\]`, flags);

/** All inner contents of a block type, in order of appearance. */
export function extractBlocks(text: string, key: AIBlockKey): string[] {
  const regex = blockRegex(key, 'g');
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) out.push(match[1]);
  return out;
}

/** First inner content of a block type, or null. */
export function extractBlock(text: string, key: AIBlockKey): string | null {
  const match = blockRegex(key).exec(text);
  return match ? match[1] : null;
}

/** Remove every [X]...[/X] block (Correction/Assessment/Insight) from text. */
export function stripAiBlocks(text: string): string {
  let out = text;
  for (const key of AI_BLOCK_KEYS) out = out.replace(blockRegex(key, 'g'), '');
  return out;
}

// --- Correction parsing (moved from utils/storage.ts) ---

export function cleanCorrectionValue(v: string): string {
  return v
    .trim()
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^"|"$/g, '')
    .replace(/^_([^_]+)_$/, '$1')
    .trim();
}

function normalizeCorrectionLine(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*•>]|\d+[.)])\s+/, '')
    .replace(/^\*\*([^*:]+?)\s*:?\s*\*\*:?\s*/, '$1: ')
    .replace(/^__([^_:]+?)\s*:?\s*__:?\s*/, '$1: ')
    .trim();
}

export interface CorrectionFields {
  original: string;
  corrected: string;
  alternative: string;
  explanation: string;
}

/** Parse "Label: value" lines out of the inner content of a [Correction] block. */
export function parseCorrectionFields(content: string): CorrectionFields {
  const out = { original: '', corrected: '', alternative: '', explanation: '' };
  for (const raw of content.split('\n')) {
    const line = normalizeCorrectionLine(raw);
    const m = line.match(/^(original|corrected|alternative|explanation)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase() as keyof typeof out;
    if (!out[key]) out[key] = cleanCorrectionValue(m[2]);
  }
  return out;
}

/** Parse a [Correction] inner content; null if there is no actual correction. */
export function parseCorrectionBlock(content: string): Correction | null {
  const { original, corrected, alternative, explanation } = parseCorrectionFields(content);
  if (!original && !corrected) return null;
  return { original, corrected, alternative, explanation };
}

/**
 * Pull the "Alternative / Better alternative / Try saying" line out of the full
 * model text (used for the inline "Natural Phrasing" chip under user turns).
 */
export function extractCorrectionSuggestion(full: string): string | undefined {
  const primary = full.match(/Alternative:\s*(.*?)(?:\n|\[\/Correction\]|$)/i);
  if (primary) {
    const value = primary[1].trim().replace(/^"|"$/g, '');
    if (value) return value;
  }
  const fallback = full.match(/(?:Better alternative|Alternative|Try saying):\s*(.*?)(?:\n|$)/i);
  return fallback ? fallback[1].trim() || undefined : undefined;
}
