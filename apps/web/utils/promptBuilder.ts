// Prompt assembly — tách từ App.tsx (god component) ra util thuần, dễ test.
// Nguồn sự thật cho cấu trúc system prompt: SYSTEM_INSTRUCTION + difficulty +
// persona + mode snippet + scenario + custom topic.

import { AppMode } from '../types';
import type { MistakeEntry } from '../types';
import type { AIConfig } from './api';
import { SYSTEM_INSTRUCTION, DIFFICULTY_PROMPT, PERSONA_PROMPT } from '../constants';
import { MODE_CONFIGS, MODE_PROMPT_SNIPPET } from '../modes';

/** Max SRS items injected into a Review Class system prompt (keeps it compact). */
const REVIEW_DECK_CAP = 8;

/**
 * Full system prompt cho một turn chat (mode/scenario/topic đọc từ refs).
 * reviewDrills: deck SRS cho REVIEW mode (được App chuẩn bị khi start session).
 */
export function buildSystemPrompt(
  cfg: AIConfig,
  mode: AppMode,
  scenarioId: string,
  customTopic: string,
  reviewDrills?: MistakeEntry[]
): string {
  if (cfg.systemPromptOverride?.trim()) return cfg.systemPromptOverride;
  const extra = `\n\nSTUDENT LEVEL: ${DIFFICULTY_PROMPT[cfg.difficulty ?? 'intermediate']}\nCOACH TONE: ${PERSONA_PROMPT[cfg.persona ?? 'encouraging']}`;
  const modeSnippet = MODE_PROMPT_SNIPPET[mode] ?? '';
  const scenario = MODE_CONFIGS[mode]?.scenarios?.find((s) => s.id === scenarioId);
  const scenarioLine = scenario ? `\nSCENARIO: ${scenario.label} — ${scenario.setup}` : '';
  const customLine =
    mode === AppMode.CUSTOM && customTopic.trim()
      ? `\nLESSON TOPIC (CLASSROOM — STRICT, DO NOT DIGRESS): ${customTopic.trim()}\nYou are the TEACHER for this lesson. Open by confirming the topic + asking ONE level/goal check, then loop: teach ONE micro-point → 2 examples → ONE drill task → detailed correction. Stay 100% on this topic.`
      : '';
  const reviewLine =
    mode === AppMode.REVIEW && reviewDrills
      ? `\nREVIEW DECK (${Math.min(reviewDrills.length, REVIEW_DECK_CAP)} saved corrections, most overdue first — drill these ONE by ONE):\n` +
        (reviewDrills.length
          ? reviewDrills
              .slice(0, REVIEW_DECK_CAP)
              .map(
                (m, i) =>
                  `${i + 1}. "${m.original}" → "${m.corrected}"${m.explanation ? ` — rule: ${m.explanation}` : ''}`
              )
              .join('\n')
          : 'The deck is empty. Fall back to re-drilling the mistakes from THIS conversation, or common Vietnamese-learner pitfalls (articles, tenses, countable nouns).') +
        '\nWork through the deck IN ORDER. Ask the student to produce NEW sentences (fresh context) for each item; judge recall, re-teach briefly when needed.'
      : '';
  return (
    SYSTEM_INSTRUCTION +
    extra +
    `\n\nCURRENT MODE: ${mode}\nMODE BEHAVIOR: ${modeSnippet}` +
    scenarioLine +
    customLine +
    reviewLine
  );
}

/** Prompt "Finish & Assess" theo mode — các mode chỉ khác phần dặn dò cuối buổi. */
export function finishPrompt(mode: AppMode): string {
  switch (mode) {
    case AppMode.MEETING:
      return 'The meeting is over. Provide [Assessment], then summarise: 3 strengths, 2 things to improve (conciseness + professionalism), plus action-items list from our discussion. Say goodbye.';
    case AppMode.PRESENTATION:
      return 'The presentation is over. Provide [Assessment], then report: structure score, pace (use WPM if observable), filler words, 1 signposting tip, plus ONE tough Q&A question to practice next. Say goodbye.';
    case AppMode.CUSTOM:
      return 'The lesson is over. Provide [Assessment], then give a 3-question mini-quiz on the lesson topic for homework plus a 2-sentence recap. Say goodbye.';
    case AppMode.REVIEW:
      return 'The review class is over. Provide [Assessment], then report which drill items the student self-corrected (good recall) vs still re-drilled (needs work), each in one line, plus ONE concrete step for the next review. Say goodbye.';
    case AppMode.DEBATE:
      return 'The debate is over. Provide [Assessment], then declare the verdict: 1 strongest argument of the student, 1 weakest (and why), plus 2 connectors/hedge phrasings to reuse. Say goodbye.';
    case AppMode.STORY:
      return 'The story session is over. Provide [Assessment], then give the story a 1-2 sentence finale. Quote the student\'s best 2 sentences (why they worked) and 1 vivid vocab item to keep. Say goodbye.';
    case AppMode.TRANSLATE:
      return 'Session over. Provide [Assessment], then list the 3 most useful natural phrasings we learned with 1-line nuance each. Say goodbye.';
    default:
      return 'The student has ended the session. Please provide a final assessment using the [Assessment] block, briefly summarize strengths and areas to improve, then say goodbye.';
  }
}
