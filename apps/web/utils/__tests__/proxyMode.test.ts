import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatStream, loadConfig, saveConfig, speech, transcribe, type AIConfig } from '../api';

// --- minimal window/localStorage stub (tests run in plain node env) ---
let store: Record<string, string> = {};
const localStorageStub = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    store = {};
  },
};

beforeEach(() => {
  store = {};
  vi.stubGlobal('window', { localStorage: localStorageStub });
  vi.stubGlobal('localStorage', localStorageStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('config migration (useServerProxy)', () => {
  it('legacy config with a stored key stays on direct BYOK (no silent switch)', () => {
    store['fluentdev-ai-config'] = JSON.stringify({ apiKey: 'sk-legacy', model: 'm' });
    const cfg = loadConfig();
    expect(cfg.useServerProxy).toBe(false);
    expect(cfg.apiKey).toBe('sk-legacy');
  });

  it('legacy keyless config defaults to proxy mode', () => {
    store['fluentdev-ai-config'] = JSON.stringify({ model: 'm' });
    expect(loadConfig().useServerProxy).toBe(true);
  });

  it('explicit useServerProxy survives a round-trip', () => {
    store['fluentdev-ai-config'] = JSON.stringify({ useServerProxy: true });
    expect(loadConfig().useServerProxy).toBe(true);
  });
});

describe('saveConfig key handling', () => {
  it('strips the API key in proxy mode (nothing plaintext in localStorage)', () => {
    saveConfig({ ...loadConfig(), useServerProxy: true, apiKey: 'sk-secret' });
    const raw = JSON.parse(store['fluentdev-ai-config']);
    expect(raw.apiKey).toBe('');
    expect(raw.useServerProxy).toBe(true);
  });

  it('keeps the key in explicit direct BYOK mode', () => {
    saveConfig({ ...loadConfig(), useServerProxy: false, apiKey: 'sk-direct' });
    const raw = JSON.parse(store['fluentdev-ai-config']);
    expect(raw.apiKey).toBe('sk-direct');
  });
});

describe('provider endpoints per connection mode', () => {
  it('proxy mode: chat goes to the Library server and sends no Authorization', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await chatStream({ ...loadConfig(), apiKey: 'sk-should-not-leak' }, [], () => {});
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:8241/api/ai/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('direct mode: chat goes to baseUrl with the BYOK Authorization header', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cfg: AIConfig = { ...loadConfig(), baseUrl: 'http://gateway.local/v1', useServerProxy: false, apiKey: 'sk-x' };
    await chatStream(cfg, [], () => {});
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gateway.local/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-x');
  });

  it('proxy mode: TTS + STT route through the proxy without credentials', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response('{"text":"hi"}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const cfg: AIConfig = { ...loadConfig(), sttModel: 'm1', ttsModel: 'm2', ttsVoice: 'v' };
    await speech(cfg, 'hello');
    await transcribe(cfg, new Blob(['x']));
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      'http://localhost:8241/api/ai/audio/speech',
      'http://localhost:8241/api/ai/audio/transcriptions',
    ]);
    for (const call of fetchMock.mock.calls) {
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers?.Authorization).toBeUndefined();
    }
  });
});
