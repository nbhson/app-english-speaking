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
