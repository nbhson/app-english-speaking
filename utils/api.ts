
// --- Custom Provider API client + config ---
// All LLM traffic (chat, STT, TTS) goes through a configurable OpenAI-compatible
// base URL. Defaults point at a local custom provider gateway. The chat model is the
// "brain"; STT/TTS can run on the browser (Web Speech API) or through the custom provider.

export interface AIConfig {
  baseUrl: string;        // e.g. http://localhost:20128/v1
  apiKey: string;         // Bearer token (may be empty on local custom provider)
  model: string;          // chat model, e.g. gemini/gemini-3-flash-preview
  sttEngine: 'browser' | 'custom';
  sttModel: string;       // e.g. deepgram/nova-3 (only used when sttEngine=custom)
  ttsEngine: 'browser' | 'custom';
  ttsModel: string;       // e.g. openai/tts-1 (only used when ttsEngine=custom)
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
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AIConfig> & Record<string, unknown>;
      // Migrate legacy 'omniroute' value to 'custom'
      if ((parsed.sttEngine as string) === 'omniroute') parsed.sttEngine = 'custom' as AIConfig['sttEngine'];
      if ((parsed.ttsEngine as string) === 'omniroute') parsed.ttsEngine = 'custom' as AIConfig['ttsEngine'];
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load config', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(cfg: AIConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    if (cfg.apiKey) {
      console.warn(
        'API key is stored in localStorage (plaintext). Only use with a local gateway or ensure the page is served over HTTPS and protected from XSS.'
      );
    }
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
 * Robust SSE: handles \r\n, comments, empty keep-alives and aborts via AbortSignal.
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

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;
    // SSE comments start with ':'
    if (line.startsWith(':')) return;
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const parsed = JSON.parse(payload);
      // Support both delta (stream) and message (non-stream fallback)
      const delta: unknown =
        parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        full += delta;
        onDelta(delta);
      }
      // Surface API errors encoded in SSE
      if (parsed.error) {
        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      }
    } catch (e) {
      // Re-throw real errors, ignore JSON parse noise
      if (e instanceof SyntaxError) return;
      throw e;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      buffer += decoder.decode(value, { stream: true });
      // Handle both \n and \r\n
      let idx: number;
      while ((idx = buffer.search(/\r?\n/)) >= 0) {
        const isCRLF = buffer[idx] === '\r';
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + (isCRLF ? 2 : 1));
        processLine(line);
      }
    }
    // Flush remaining buffer (no trailing newline)
    if (buffer.trim()) processLine(buffer);
  } finally {
    try {
      reader.cancel();
    } catch {
      /* ignore */
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

/** STT through custom provider (/v1/audio/transcriptions, multipart). */
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

/** TTS through custom provider (/v1/audio/speech) — returns the audio blob. */
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
