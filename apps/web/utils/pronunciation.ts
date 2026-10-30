// Pronunciation drill scoring — so khớp lời nói (qua STT) với câu mẫu.
// Đây là metric THẬT từ audio (đi qua nhận diện giọng nói), không phải LLM đoán:
// điểm = độ phủ từ của câu mẫu được nhận diện đúng (word-level accuracy).

/** Lowercase, bỏ dấu câu & số, tách từ. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Levenshtein distance trên mảng từ (dynamic programming). */
export function levenshteinWords(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1, // deletion
        cur[j - 1] + 1, // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export interface PronunciationDiff {
  score: number; // 0-100
  /** Trạng thái từng từ của câu mẫu, theo thứ tự: ok = nhận diện đúng,
   *  wrong = vị trí lệch/khớp gần đúng, missing = không nhận diện được. */
  words: Array<{ word: string; status: 'ok' | 'wrong' | 'missing' }>;
  said: string; // transcript STT thu được
}

/** So khớp câu mẫu với lời nói nhận diện được. */
export function scorePronunciation(target: string, said: string): PronunciationDiff {
  const t = normalizeWords(target);
  const s = normalizeWords(said);
  if (t.length === 0) return { score: 0, words: [], said };

  // DP align (levenshtein với backtrace) để gán trạng thái từng từ của target.
  const m = t.length;
  const n = s.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (t[i - 1] === s[j - 1] ? 0 : 1)
      );
    }
  }

  // Backtrace từ (m, n): matching = ok, substitution = wrong, deletion = missing.
  const words: PronunciationDiff['words'] = Array.from({ length: m }, (_, i) => ({
    word: t[i],
    status: 'missing' as const,
  }));
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (t[i - 1] === s[j - 1] ? 0 : 1)) {
      words[i - 1].status = t[i - 1] === s[j - 1] ? 'ok' : 'wrong';
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      words[i - 1].status = 'missing';
      i--;
    } else {
      // insertion — không ảnh hưởng target, chỉ bỏ qua
      j--;
    }
  }

  const dist = dp[m][n];
  const score = Math.max(0, Math.round((1 - dist / Math.max(m, 1)) * 100));
  return { score, words, said };
}
