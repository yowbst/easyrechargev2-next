/**
 * Which register purposes look like electrical installation work.
 *
 * The same pattern string runs in two places: as the SPARQL REGEX prefilter
 * (so the endpoint returns a few thousand rows, not the whole register) and in
 * TypeScript as the authoritative check. It therefore sticks to syntax both
 * engines share: alternation, character classes, `.`, `?`, `\s`. It is a
 * candidate filter, not a verdict. Roughly one hit in four is a real installer;
 * the classifier separates inspectors, planners, solar firms and the rest.
 *
 * Deliberately absent: a bare "électricité" or "électro". Those match
 * "électroménager" and "électronique" shops, which is the noise this pattern
 * exists to avoid.
 */
export const CANDIDATE_PATTERN = [
  // French
  "installations? [ée]lectriques?",
  "installations? (de |d.)[ée]lectricit[ée]",
  "entreprise d.[ée]lectricit[ée]",
  "travaux d.[ée]lectricit[ée]",
  "domaine de l.[ée]lectricit[ée]",
  "[ée]lectricien",
  "[ée]lectricit[ée] (g[ée]n[ée]rale|du b[aâ]timent)",
  "courant (fort|faible)",
  // German
  "elektro-?installation",
  "elektriker",
  "elektroanlagen",
  "elektro(technische|fach)",
  "elektrische (anlagen|installationen)",
  // Italian
  "impianti elettrici",
  "installazioni elettriche",
  "elettricista",
].join("|");

const CANDIDATE_RE = new RegExp(CANDIDATE_PATTERN, "i");

export function isInstallerCandidate(purpose: string | null | undefined): boolean {
  return !!purpose && CANDIDATE_RE.test(purpose);
}

/** Escapes a string for a SPARQL double-quoted literal. */
export function sparqlStringLiteral(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
