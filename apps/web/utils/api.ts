
// --- Custom Provider API client + config ---
// All LLM traffic (chat, STT, TTS) goes through a configurable OpenAI-compatible
// base URL. Defaults point at a local custom provider gateway. The chat model is the
// "brain"; STT/TTS can run on the browser (Web Speech API) or through the custom provider.

import { DEFAULT_BASE_URL, LIBRARY_API_URL } from './config';

export interface AIConfig {
  baseUrl: string;        // e.g. http://localhost:20128/v1
  apiKey: string;         // Bearer token (may be empty on local custom provider)
  model: string;          // chat model, e.g. gemini/gemini-3-flash-preview
  sttEngine: 'browser' | 'custom';
  sttModel: string;       // e.g. deepgram/nova-3 (only used when sttEngine=custom)
  ttsEngine: 'browser' | 'custom';
  ttsModel: string;       // e.g. openai/tts-1 (only used when ttsEngine=custom)
  ttsVoice: string;       // e.g. alloy / Zephyr
  // --- new: voice + coach personalization ---
  ttsRate?: number;       // browser speechSynthesis rate 0.5-2 (default 1)
  ttsPitch?: number;      // browser speechSynthesis pitch 0-2 (default 1)
  ttsVoiceURI?: string;   // preferred browser voice (voiceURI/name/lang)
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  persona?: 'encouraging' | 'strict' | 'professional';
  systemPromptOverride?: string; // full override of SYSTEM_INSTRUCTION
  // --- connection mode ---
  // true (default): all provider traffic goes through the local Library server
  //   proxy (POST {LIBRARY_API}/api/ai/<action>) — the API key lives in the
  //   server env and is never stored in the browser.
  // false: direct BYOK — requests hit `baseUrl` with the key from localStorage
  //   (plaintext; explicit opt-in for serverless usage, labeled in Settings).
  useServerProxy?: boolean;
}

export const DEFAULT_CONFIG: AIConfig = {
  baseUrl: DEFAULT_BASE_URL,
  apiKey: '',
  model: 'gemini/gemini-3-flash-preview',
  sttEngine: 'browser',
  sttModel: 'deepgram/nova-3',
  ttsEngine: 'browser',
  ttsModel: 'vertex/gemini-2.5-flash-preview-tts',
  ttsVoice: 'Zephyr',
  ttsRate: 1,
  ttsPitch: 1,
  ttsVoiceURI: '',
  difficulty: 'intermediate',
  persona: 'encouraging',
  systemPromptOverride: '',
  useServerProxy: true,
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
      // Proxy-mode migration: configs saved before `useServerProxy` existed.
      // A stored plaintext key means the user was on direct BYOK — keep them
      // on direct mode (never switch silently) and let App show a one-time
      // notice offering the proxy. Keyless configs default to proxy mode.
      if (parsed.useServerProxy === undefined) {
        parsed.useServerProxy = !(typeof parsed.apiKey === 'string' && parsed.apiKey.length > 0);
      }
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load config', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(cfg: AIConfig): void {
  try {
    // Proxy mode: the upstream key lives in the server env — never persist it
    // in the browser. Direct (BYOK) mode is the explicit plaintext exception.
    const toStore: AIConfig = cfg.useServerProxy ? { ...cfg, apiKey: '' } : cfg;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    if (!cfg.useServerProxy && cfg.apiKey) {
      console.warn(
        'API key is stored in localStorage (plaintext) because direct BYOK mode is active. ' +
          'Prefer the server proxy (Settings → Connection mode) so the key stays in the server env.',
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

const LIBRARY_BASE = LIBRARY_API_URL.replace(/\/+$/, '');

/**
 * Provider endpoint for a given OpenAI-style path ('chat/completions',
 * 'audio/transcriptions', 'audio/speech'). Proxy mode routes through the
 * local Library server (/api/ai/<action>) which injects the upstream key
 * server-side; direct mode hits the configured gateway with the BYOK key.
 */
function providerUrl(config: AIConfig, path: string): string {
  if (config.useServerProxy) return `${LIBRARY_BASE}/api/ai/${path}`;
  return `${baseUrl(config)}/${path}`;
}

function buildHeaders(config: AIConfig, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  // Proxy mode: the client never sends credentials — the server injects
  // Authorization from its own env when forwarding upstream.
  if (config.apiKey && !config.useServerProxy) headers['Authorization'] = `Bearer ${config.apiKey}`;
  return headers;
}

/** Readiness probe for the Settings UI: is the Library-server proxy reachable, does it have a key? */
export async function proxyStatus(signal?: AbortSignal): Promise<{ ok: boolean; hasKey: boolean } | null> {
  try {
    const res = await fetch(`${LIBRARY_BASE}/api/ai/status`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { hasKey?: boolean };
    return { ok: true, hasKey: data.hasKey === true };
  } catch {
    return null;
  }
}

async function assertOk(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  const errText = await res.text().catch(() => '');
  throw new Error(`${label} failed (${res.status}): ${errText.slice(0, 300)}`);
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
  const url = providerUrl(config, 'chat/completions');
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ model: config.model, messages, stream: true }),
    signal,
  });

  await assertOk(res, 'Chat');
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
  // The stream may close cleanly after an abort (server/undici close-on-abort).
  // That must still surface as an AbortError, never as a "complete" reply.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return full;
}

/** Non-streaming chat completion — returns just the assistant text. */
export async function chatOnce(config: AIConfig, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const url = providerUrl(config, 'chat/completions');
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ model: config.model, messages, stream: false }),
    signal,
  });
  await assertOk(res, 'Chat');
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** STT through the provider (POST /v1/audio/transcriptions, multipart) — direct or via proxy. */
export async function transcribe(config: AIConfig, blob: Blob): Promise<string> {
  const url = providerUrl(config, 'audio/transcriptions');
  const form = new FormData();
  form.append('file', blob, 'recording.webm');
  form.append('model', config.sttModel);
  const headers: Record<string, string> = {};
  if (config.apiKey && !config.useServerProxy) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const res = await fetch(url, { method: 'POST', headers, body: form });
  await assertOk(res, 'STT');
  const data = await res.json();
  return data.text || '';
}

/** TTS through the provider (/v1/audio/speech) — returns the audio blob. */
export async function speech(config: AIConfig, text: string, signal?: AbortSignal): Promise<Blob> {
  const url = providerUrl(config, 'audio/speech');
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ model: config.ttsModel, input: text, voice: config.ttsVoice }),
    signal,
  });
  await assertOk(res, 'TTS');
  return res.blob();
}

// --- Translation helpers (reuse the chat model) ---

export interface WordInfo {
  translation: string;
  ipa: string;
  example: string;
}

export async function translateWord(config: AIConfig, word: string, signal?: AbortSignal): Promise<WordInfo | null> {
  try {
    const raw = await chatOnce(config, [
      {
        role: 'system',
        content:
          'You are a precise bilingual dictionary (English→Vietnamese). ' +
          'Deterministic, temperature 0. ' +
          'Return ONLY a single valid JSON object, no markdown fences, no extra text, no explanation. ' +
          'Schema: {"translation":"<concise Vietnamese meaning, 1-3 words>","ipa":"/<IPA with slashes, e.g. /həˈloʊ/>","example":"<one natural English example ≤15 words>"} ' +
          'If the word is unknown/misspelled, still return JSON with best guess translation and empty ipa/example as "".',
      },
      { role: 'user', content: word },
    ], signal);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    return {
      translation: (parsed.translation ?? raw.trim()).toString().slice(0, 80),
      ipa: (parsed.ipa ?? '').toString().slice(0, 40),
      example: (parsed.example ?? '').toString().slice(0, 120),
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    console.error('Word translation error', e);
    return null;
  }
}

export async function translatePhrase(config: AIConfig, text: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const result = await chatOnce(config, [
      {
        role: 'system',
        content:
          'You are a precise translator (English→Vietnamese). ' +
          'Translate to natural, conversational Vietnamese (not literary/Hán-Việt). ' +
          'Keep proper nouns, code, and numbers unchanged. ' +
          'Return ONLY the translated string, no quotes, no markdown, no explanation, no alternative.',
      },
      { role: 'user', content: text },
    ], signal);
    // Strip accidental quotes/fences the model might add
    return result.trim().replace(/^["'`“”]+|["'`“”]+$/g, '').replace(/^```.*\n?/, '').replace(/```$/,'').trim() || null;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    console.error('Phrase translation error', e);
    return null;
  }
}
