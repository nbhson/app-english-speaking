import type { WordInfo } from './api';

const MAX_CACHE_SIZE = 100;

class LRUCache<K, V> {
  private map = new Map<K, V>();

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key)!;
    // Move to end (most recent)
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= MAX_CACHE_SIZE) {
      // Delete oldest (first key)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

export const translationCache = new LRUCache<string, WordInfo>();

// In-flight dedupe: multiple hovers on the same word share one network request.
const inflight = new Map<string, Promise<WordInfo | null>>();

export function getInflight(key: string): Promise<WordInfo | null> | undefined {
  return inflight.get(key);
}

export function setInflight(key: string, p: Promise<WordInfo | null>): void {
  inflight.set(key, p);
  void p.finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
}
