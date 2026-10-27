// Central place for runtime endpoint URLs. Values come from Vite env vars
// (see .env.example); localhost values are dev-only fallbacks so a missing
// .env still works in local development.

/** Read an optional Vite env var without depending on vite/client types. */
function viteEnv(key: string): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const value = env?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Default OpenAI-compatible LLM gateway base URL (chat/STT/TTS). */
export const DEFAULT_BASE_URL = viteEnv('VITE_DEFAULT_BASE_URL') || 'http://localhost:20128/v1';

/** Library API (apps/server, SQLite). Falls back to localStorage if unreachable. */
export const LIBRARY_API_URL = viteEnv('VITE_LIBRARY_API') || 'http://localhost:8241';
