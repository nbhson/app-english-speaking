import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, finishPrompt } from '../promptBuilder';
import { AppMode, MistakeEntry } from '../../types';
import { DEFAULT_CONFIG } from '../api';

describe('buildSystemPrompt', () => {
  it('full override replaces everything', () => {
    const p = buildSystemPrompt({ ...DEFAULT_CONFIG, systemPromptOverride: 'CUSTOM ONLY' }, AppMode.DAILY, 'weekend', '');
    expect(p).toBe('CUSTOM ONLY');
  });

  it('includes level, tone, mode snippet and scenario', () => {
    const p = buildSystemPrompt({ ...DEFAULT_CONFIG, difficulty: 'advanced', persona: 'strict' }, AppMode.MEETING, 'standup', '');
    expect(p).toContain('ADVANCED (B2-C1)');
    expect(p).toContain('strict coach');
    expect(p).toContain('MEETING SIMULATOR');
    expect(p).toContain('SCENARIO: Daily Standup');
  });

  it('custom topic only affects CUSTOM mode', () => {
    const inCustom = buildSystemPrompt(DEFAULT_CONFIG, AppMode.CUSTOM, 'understand', 'present perfect');
    expect(inCustom).toContain('LESSON TOPIC');
    const inDaily = buildSystemPrompt(DEFAULT_CONFIG, AppMode.DAILY, 'weekend', 'present perfect');
    expect(inDaily).not.toContain('LESSON TOPIC');
  });

  it('REVIEW mode injects the deck and caps it at 8 items', () => {
    const mk = (i: number): MistakeEntry => ({
      id: `m${i}`,
      original: `wrong ${i}`,
      corrected: `right ${i}`,
      alternative: '',
      explanation: `rule ${i}`,
      mode: AppMode.DAILY,
      createdAt: i,
      reviewCount: 0,
    });
    const deck = Array.from({ length: 12 }, (_, i) => mk(i));
    const p = buildSystemPrompt(DEFAULT_CONFIG, AppMode.REVIEW, '', '', deck);
    expect(p).toContain('REVIEW DECK (8 saved corrections');
    expect(p).toContain('"wrong 0" → "right 0"');
    expect(p).toContain('"wrong 7" → "right 7"');
    expect(p).not.toContain('wrong 8');
    // the deck never leaks into other modes
    const daily = buildSystemPrompt(DEFAULT_CONFIG, AppMode.DAILY, 'weekend', '', deck);
    expect(daily).not.toContain('REVIEW DECK');
  });

  it('REVIEW mode with empty deck instructs a fallback', () => {
    const p = buildSystemPrompt(DEFAULT_CONFIG, AppMode.REVIEW, '', '', []);
    expect(p).toContain('The deck is empty');
  });
});

describe('finishPrompt', () => {
  it('mode-specific wrap-up prompts', () => {
    expect(finishPrompt(AppMode.MEETING)).toContain('action-items');
    expect(finishPrompt(AppMode.PRESENTATION)).toContain('Q&A');
    expect(finishPrompt(AppMode.CUSTOM)).toContain('mini-quiz');
    expect(finishPrompt(AppMode.TRANSLATE)).toContain('phrasings');
    expect(finishPrompt(AppMode.DAILY)).toContain('[Assessment]');
    expect(finishPrompt(AppMode.ROLEPLAY)).toContain('[Assessment]');
    expect(finishPrompt(AppMode.REVIEW)).toContain('self-corrected');
  });
});
