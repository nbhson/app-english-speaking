
// --- OmniRoute API client + config ---
// All LLM traffic (chat, STT, TTS) goes through a configurable OpenAI-compatible
// base URL. Defaults point at a local OmniRoute gateway. The chat model is the
// "brain"; STT/TTS can run on the browser (Web Speech API) or through OmniRoute.

export interface AIConfig {
  baseUrl: string;        // e.g. http://localhost:20128/v1
  apiKey: string;         // Bearer token (may be empty on local OmniRoute)
  model: string;          // chat model, e.g. gemini/gemini-3-flash-preview
  sttEngine: 'browser' | 'omniroute';
  sttModel: string;       // e.g. deepgram/nova-3 (only used when sttEngine=omniroute)
  ttsEngine: 'browser' | 'omniroute';
  ttsModel: string;       // e.g. openai/tts-1 (only used when ttsEngine=omniroute)
  ttsVoice: string;       // e.g. alloy / Zephyr
}

export const DEFAULT_CONFIG: AIConfig = {
  baseUrl: 'http://localhost:20128/v1',
  apiKey: '',
  model: 'gemini/gemini-3-flash-preview',
  sttEngine: 'browser',
  sttModel: 'deepgram/nova-3',
  ttsEngine: 'browser',
  ttsModel: 'vertex/gemini-2.5-flash-preview-tts',
  ttsVoice: 'Zephyr',
};

const STORAGE_KEY = 'fluentdev-ai-config';

export function loadConfig(): AIConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CONFIG };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Failed to load config', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(cfg: AIConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.error('Failed to save config', e);
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function baseUrl(config: AIConfig): string {
  return config.baseUrl.replace(/\/+$/, '');
}

function buildHeaders(config: AIConfig, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
  return headers;
}

/**
 * Stream a chat completion. Calls onDelta with each text chunk as it arrives
 * and resolves with the full assistant text when done.
 */
export async function chatStream(
  config: AIConfig,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${baseUrl(config)}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ model: config.model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Chat failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('Chat failed: empty response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // Ignore malformed SSE chunks.
      }
    }
  }
  return full;
}

/** Non-streaming chat completion — returns just the assistant text. */
export async function chatOnce(config: AIConfig, messages: ChatMessage[]): Promise<string> {
  const url = `${baseUrl(config)}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ model: config.model, messages, stream: false }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Chat failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** STT through OmniRoute (/v1/audio/transcriptions, multipart). */
export async function transcribe(config: AIConfig, blob: Blob): Promise<string> {
  const url = `${baseUrl(config)}/audio/transcriptions`;
  const form = new FormData();
  form.append('file', blob, 'recording.webm');
  form.append('model', config.sttModel);
  const headers: Record<string, string> = {};
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const res = await fetch(url, { method: 'POST', headers, body: form });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`STT failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.text || '';
}

/** TTS through OmniRoute (/v1/audio/speech) — returns the audio blob. */
export async function speech(config: AIConfig, text: string): Promise<Blob> {
  const url = `${baseUrl(config)}/audio/speech`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ model: config.ttsModel, input: text, voice: config.ttsVoice }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`TTS failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  return res.blob();
}

// --- Translation helpers (reuse the chat model) ---

export interface WordInfo {
  translation: string;
  ipa: string;
  example: string;
}

export async function translateWord(config: AIConfig, word: string): Promise<WordInfo | null> {
  try {
    const raw = await chatOnce(config, [
      {
        role: 'system',
        content:
          'You are a dictionary. Translate the given English word to Vietnamese. ' +
          'Return ONLY a JSON object with no markdown fences: ' +
          '{"translation":"<Vietnamese>","ipa":"<IPA pronunciation>","example":"<one short English example sentence>"}',
      },
      { role: 'user', content: word },
    ]);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    return { translation: parsed.translation ?? raw.trim(), ipa: parsed.ipa ?? '', example: parsed.example ?? '' };
  } catch (e) {
    console.error('Word translation error', e);
    return null;
  }
}

export async function translatePhrase(config: AIConfig, text: string): Promise<string | null> {
  try {
    return await chatOnce(config, [
      {
        role: 'system',
        content:
          'You are a translator. Translate the given text to natural Vietnamese. ' +
          'Return ONLY the translated string with no explanations, quotes or markdown.',
      },
      { role: 'user', content: text },
    ]);
  } catch (e) {
    console.error('Phrase translation error', e);
    return null;
  }
}
