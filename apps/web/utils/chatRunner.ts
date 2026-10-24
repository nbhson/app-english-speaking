import type { AIConfig, ChatMessage } from './api';
import { chatStream } from './api';

export interface StreamTurnHandlers {
  onDelta: (delta: string) => void;
  /** Stream aborted (user pressed stop / left the session). */
  onAbort: () => void;
  /** Network/API failure surfacing a user-facing message. */
  onError: (message: string) => void;
  /** Stream finished; full accumulated text. */
  onDone: (full: string) => void;
}

/**
 * Shared chat-stream runner used by both the live turn (processUserText)
 * and the final assessment turn (finishAndAssess). Keeps the
 * AbortController bookkeeping and error mapping in one place.
 */
export async function runChatStream(
  config: AIConfig,
  messages: ChatMessage[],
  handlers: StreamTurnHandlers,
  registerAbort: (controller: AbortController) => void,
  unregisterAbort: () => void,
): Promise<void> {
  const controller = new AbortController();
  registerAbort(controller);
  try {
    const full = await chatStream(config, messages, handlers.onDelta, controller.signal);
    handlers.onDone(full);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') handlers.onAbort();
    else handlers.onError(err instanceof Error ? err.message : 'Connection failed');
  } finally {
    unregisterAbort();
  }
}
