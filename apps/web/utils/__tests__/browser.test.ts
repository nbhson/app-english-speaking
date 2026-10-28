import { describe, it, expect } from 'vitest';
import { voiceQualityScore, pickBestEnglishVoice } from '../browser';

function fakeVoice(partial: Partial<SpeechSynthesisVoice>): SpeechSynthesisVoice {
  return {
    name: 'Test Voice',
    lang: 'en-US',
    voiceURI: 'test',
    default: false,
    localService: true,
    ...partial,
  } as SpeechSynthesisVoice;
}

describe('voiceQualityScore', () => {
  it('ranks neural/natural voices above compact robot voices', () => {
    const neural = fakeVoice({ name: 'Microsoft Aria Online (Natural)' });
    const compact = fakeVoice({ name: 'Fred (Compact)', lang: 'en-US' });
    expect(voiceQualityScore(neural)).toBeGreaterThan(voiceQualityScore(compact));
  });

  it('prefers en-US over non-English voices', () => {
    const en = fakeVoice({ name: 'Some Voice', lang: 'en-US' });
    const viVoice = fakeVoice({ name: 'Giong Viet', lang: 'vi-VN' });
    expect(voiceQualityScore(en)).toBeGreaterThan(voiceQualityScore(viVoice));
  });

  it('penalizes known low-quality voices', () => {
    const good = fakeVoice({ name: 'Samantha' });
    const bad = fakeVoice({ name: 'Eloquence Robo' });
    expect(voiceQualityScore(good)).toBeGreaterThan(voiceQualityScore(bad));
  });
});

describe('pickBestEnglishVoice', () => {
  it('returns the highest-scored English voice', () => {
    const voices = [
      fakeVoice({ name: 'Fred (Compact)', lang: 'en-US' }),
      fakeVoice({ name: 'Google US English', lang: 'en-US' }),
      fakeVoice({ name: 'Giong', lang: 'vi-VN' }),
    ];
    const best = pickBestEnglishVoice(voices);
    expect(best?.name).toBe('Google US English');
  });

  it('returns null when no English voice exists', () => {
    expect(pickBestEnglishVoice([fakeVoice({ name: 'Giong', lang: 'vi-VN' })])).toBeNull();
    expect(pickBestEnglishVoice([])).toBeNull();
  });
});
