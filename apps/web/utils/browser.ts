// Browser capability helpers: STT support, TTS voices.

export function isBrowserSTTSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function listBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

export function pickVoiceByURI(voiceURI?: string): SpeechSynthesisVoice | null {
  if (!voiceURI) return null;
  const voices = listBrowserVoices();
  return voices.find((v) => v.voiceURI === voiceURI || v.name === voiceURI || v.lang === voiceURI) ?? null;
}

export function englishVoices(): SpeechSynthesisVoice[] {
  return listBrowserVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

// --- Voice quality ranking ---
// OS default voices are often robotic. Neural/online voices sound far more
// human, so when the user hasn't picked a voice we auto-select the best one.

const NEURAL_HINTS = /natural|neural|premium|enhanced|google/i;
const KNOWN_GOOD = /samantha|ava|aria|jenny|guy|daniel|serena|allison|zoe|karen|moira|tessa/i;
// Compact/macOS legacy voices are the classic "robot" ones.
const LOW_QUALITY_HINTS = /compact|eloquence|espeak|festival|robot/i;

export function voiceQualityScore(v: SpeechSynthesisVoice): number {
  let s = 0;
  const lang = v.lang.toLowerCase().replace('_', '-');
  if (lang.startsWith('en-us')) s += 20;
  else if (lang.startsWith('en-gb') || lang.startsWith('en-au')) s += 15;
  else if (lang.startsWith('en')) s += 10;
  else s -= 100; // non-English voice would read English text badly
  if (NEURAL_HINTS.test(v.name)) s += 50;
  if (KNOWN_GOOD.test(v.name)) s += 30;
  if (LOW_QUALITY_HINTS.test(v.name)) s -= 40;
  // Online voices (Google/Edge neural) are streamed and usually clearer.
  if (!v.localService && NEURAL_HINTS.test(v.name)) s += 10;
  return s;
}

/**
 * Best available English voice by heuristic quality score. Used as fallback
 * when the user hasn't picked a voice (ttsVoiceURI empty or stale).
 */
export function pickBestEnglishVoice(voices: SpeechSynthesisVoice[] = englishVoices()): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en'));
  if (en.length === 0) return null;
  return [...en].sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a))[0];
}

/** Resolve the configured voice, falling back to the best-sounding one. */
export function resolveVoice(voiceURI?: string): SpeechSynthesisVoice | null {
  return pickVoiceByURI(voiceURI) ?? pickBestEnglishVoice();
}
