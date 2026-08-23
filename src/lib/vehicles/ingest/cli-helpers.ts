import { deepEqual } from "./diff";

/** Minimal `--flag value` / `--boolean-flag` parser shared by the CLI entrypoint. */
export interface ParsedArgs {
  command: string | undefined;
  flag: (name: string) => string | undefined;
  has: (name: string) => boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0];
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  return { command, flag, has };
}

/**
 * Caps a list for console output. SLUG_DRIFT and GONE can legitimately be
 * long (the generated slug embeds range/battery/model, so most ordinary
 * spec revisions drift it) — printing every line would flood the terminal,
 * so callers print the count, then `shown`, then a "…and N more" footer
 * when `hiddenCount` is nonzero.
 */
export function truncateList<T>(items: T[], max = 10): { shown: T[]; hiddenCount: number } {
  return { shown: items.slice(0, max), hiddenCount: Math.max(0, items.length - max) };
}

/**
 * Field-level diff for an existing Directus `vehicle_brands` row against a
 * candidate update payload. Returns only the keys whose value actually
 * changed, so `brands --dry-run` / the real apply never blind-PATCHes a
 * brand that has nothing new to write.
 */
export function diffBrandFields(
  existing: Record<string, unknown>,
  candidate: Record<string, unknown>,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(candidate)) {
    if (!deepEqual(existing[key], next)) changes[key] = next;
  }
  return changes;
}
