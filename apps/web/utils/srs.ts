// Spaced repetition (SM-2 lite / Leitner-style) for mistakes + vocab.
// Local-first: schedule lives in localStorage; server mirror keeps base fields only.

export const DAY_MS = 24 * 60 * 60 * 1000;

// Interval progression by consecutive review count: 1d → 3d → 7d → 14d → 30d → 60d
const STEPS = [1, 3, 7, 14, 30, 60];

export function intervalDaysFor(reviewCount: number): number {
  if (reviewCount <= 0) return 1;
  return STEPS[Math.min(reviewCount - 1, STEPS.length - 1)];
}

export function scheduleNextReview(reviewCount: number, now = Date.now()): number {
  return now + intervalDaysFor(reviewCount) * DAY_MS;
}

export function isDue(nextReview?: number, now = Date.now()): boolean {
  if (nextReview === undefined || nextReview === null) return true;
  return nextReview <= now;
}

export function dueInLabel(nextReview?: number, now = Date.now()): string {
  if (nextReview === undefined || nextReview === null) return 'Due now';
  const diff = nextReview - now;
  if (diff <= 0) return 'Due now';
  const days = Math.ceil(diff / DAY_MS);
  if (days <= 1) {
    const hours = Math.ceil(diff / (60 * 60 * 1000));
    return hours <= 1 ? 'Due soon' : `Due in ${hours}h`;
  }
  return `Due in ${days}d`;
}
