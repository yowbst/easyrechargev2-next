// Pure form-input hygiene helpers. No browser/framework deps — safe on client
// and server.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trim + collapse whitespace, then Title-Case ONLY if the input is all-lower
 * or all-upper (letters only). Mixed-case input is returned trimmed but
 * otherwise unchanged, preserving intentional casing like "McDonald".
 * Idempotent.
 */
export function normalizeName(raw: string): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const letters = s.replace(/[^\p{L}]/gu, "");
  const isAllLower = letters.length > 0 && letters === letters.toLowerCase();
  const isAllUpper = letters.length > 0 && letters === letters.toUpperCase();
  if (!isAllLower && !isAllUpper) return s;
  return s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// Curated known domains (Swiss + global) for near-miss detection.
const KNOWN_DOMAINS = [
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com",
  "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "proton.me",
  "protonmail.com", "gmx.ch", "gmx.net", "bluewin.ch", "hispeed.ch",
  "sunrise.ch", "swissonline.ch", "windowslive.com",
];

// Unambiguous TLD typos only — never includes valid TLDs like "co".
const TLD_TYPOS: Record<string, string> = {
  con: "com", cmo: "com", comm: "com", vom: "com", xom: "com",
  ney: "net", nte: "net",
  chh: "ch",
};

/**
 * Optimal String Alignment (Damerau-Levenshtein) distance — adjacent
 * transpositions (e.g. "gmial" -> "gmail") count as a single edit, not two.
 * Early-exits at 2 (we only care about <= 1).
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 2;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

/**
 * Suggest a corrected email when the domain looks like a typo of a common
 * provider. Returns the full corrected address, or null when nothing to fix.
 * Never rewrites automatically — callers surface it as a suggestion.
 */
export function suggestEmailCorrection(email: string): string | null {
  const value = (email ?? "").trim();
  if (!EMAIL_RE.test(value)) return null;

  const at = value.lastIndexOf("@");
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();

  if (KNOWN_DOMAINS.includes(domain)) return null;

  // 1) TLD typo (exact map).
  const lastDot = domain.lastIndexOf(".");
  if (lastDot > 0) {
    const tld = domain.slice(lastDot + 1);
    const fixedTld = TLD_TYPOS[tld];
    if (fixedTld) {
      const fixed = `${local}@${domain.slice(0, lastDot + 1)}${fixedTld}`;
      return fixed !== value ? fixed : null;
    }
  }

  // 2) Domain near-miss (Levenshtein <= 1, unique).
  let best: string | null = null;
  let bestDist = 99;
  let tie = false;
  for (const known of KNOWN_DOMAINS) {
    const dist = levenshtein(domain, known);
    if (dist < bestDist) {
      bestDist = dist;
      best = known;
      tie = false;
    } else if (dist === bestDist) {
      tie = true;
    }
  }
  if (best && bestDist <= 1 && !tie) {
    const fixed = `${local}@${best}`;
    return fixed !== value ? fixed : null;
  }

  return null;
}
