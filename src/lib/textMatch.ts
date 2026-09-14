export function normalizeGreek(s: string): string {
  return s
    .toLowerCase()
    .replace(/ς/g, 'σ') // unify final/medial sigma
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (combining marks after NFD)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

export function similarity(a: string, b: string): number {
  const na = normalizeGreek(a);
  const nb = normalizeGreek(b);
  if (na.length === 0 && nb.length === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length, 1);
}

export function isMatch(expected: string, actual: string, threshold = 0.72): boolean {
  return similarity(expected, actual) >= threshold;
}
