import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, finishPrompt } from '../promptBuilder';
import { AppMode } from '../../types';
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
});

describe('finishPrompt', () => {
  it('mode-specific wrap-up prompts', () => {
    expect(finishPrompt(AppMode.MEETING)).toContain('action-items');
    expect(finishPrompt(AppMode.PRESENTATION)).toContain('Q&A');
    expect(finishPrompt(AppMode.CUSTOM)).toContain('mini-quiz');
    expect(finishPrompt(AppMode.TRANSLATE)).toContain('phrasings');
    expect(finishPrompt(AppMode.DAILY)).toContain('[Assessment]');
    expect(finishPrompt(AppMode.ROLEPLAY)).toContain('[Assessment]');
  });
});
