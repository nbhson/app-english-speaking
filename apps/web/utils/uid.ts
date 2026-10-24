// Single source of truth for generating client-side ids
// (was duplicated in App.tsx and storage.ts).
export const uid = (): string =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
