// Browser capability helpers: STT support, TTS voices, PWA/mobile hints.

export function isBrowserSTTSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export function isFirefox(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /firefox/i.test(navigator.userAgent);
}

export function needsPushToTalk(): boolean {
  // Web Speech API is missing on Safari iOS + Firefox -> force custom STT path
  return !isBrowserSTTSupported();
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
