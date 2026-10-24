import { describe, it, expect, vi, afterEach } from 'vitest';
import { chatStream, type AIConfig } from '../api';

const CONFIG: AIConfig = {
  baseUrl: 'http://test.local/v1',
  apiKey: '',
  model: 'test-model',
  sttEngine: 'browser',
  sttModel: '',
  ttsEngine: 'browser',
  ttsModel: '',
  ttsVoice: '',
};

function sseResponse(chunks: string[], initDelay = 0): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await new Promise((r) => setTimeout(r, initDelay));
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('chatStream SSE parsing', () => {
  it('aggregates deltas across multiple events and stops at [DONE]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          ': keep-alive comment\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          'data: {"choices":[{"delta":{}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    );
    const deltas: string[] = [];
    const full = await chatStream(CONFIG, [], (d) => deltas.push(d));
    expect(full).toBe('Hello world');
    expect(deltas).toEqual(['Hello', ' world']);
  });

  it('handles CRLF line endings and non-stream message fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'data: {"choices":[{"message":{"content":"Full reply"}}]}\r\n\r\n',
        ]),
      ),
    );
    const full = await chatStream(CONFIG, [], () => {});
    expect(full).toBe('Full reply');
  });

  it('surfaces API errors encoded in the SSE payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(['data: {"error":{"message":"Rate limited"}}\n\n']),
      ),
    );
    await expect(chatStream(CONFIG, [], () => {})).rejects.toThrow('Rate limited');
  });

  it('flushes a final line without trailing newline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(['data: {"choices":[{"delta":{"content":"tail"}}]}'])),
    );
    const full = await chatStream(CONFIG, [], () => {});
    expect(full).toBe('tail');
  });

  it('throws with status text on HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    await expect(chatStream(CONFIG, [], () => {})).rejects.toThrow('Chat failed (500)');
  });

  it('aborts when the signal is cancelled mid-stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        // Never-ending stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const never = new Promise<void>(() => {});
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"x"}}]}\n\n'));
            init?.signal?.addEventListener('abort', () => controller.close());
            await never;
          },
        });
        return new Response(stream, { status: 200 });
      }),
    );
    const ctl = new AbortController();
    const pending = chatStream(CONFIG, [], () => {}, ctl.signal);
    setTimeout(() => ctl.abort(), 10);
    await expect(pending).rejects.toThrow();
  });
});
