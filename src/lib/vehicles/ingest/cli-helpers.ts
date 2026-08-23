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
 * Per-command flag whitelist. `takesValue: false` is a bare boolean switch;
 * `true` means the following token is consumed as its value.
 */
interface FlagSpec {
  name: string;
  takesValue: boolean;
}

export const COMMAND_FLAGS: Record<string, FlagSpec[]> = {
  scrape: [{ name: "limit", takesValue: true }],
  clean: [{ name: "in", takesValue: true }],
  brands: [
    { name: "in", takesValue: true },
    { name: "dry-run", takesValue: false },
  ],
  plan: [
    { name: "in", takesValue: true },
    { name: "max-change-ratio", takesValue: true },
  ],
  apply: [
    { name: "plan", takesValue: true },
    { name: "dry-run", takesValue: false },
  ],
};

/**
 * Rejects any `--flag` not recognised for `command`, so a typo like
 * `--dryrun` (missing the hyphen) fails loudly instead of being silently
 * ignored — for `brands --dry-run`, the runbook's own "only chance to catch
 * a bad create/update", silently ignoring it means a real write to
 * production instead of the preview the operator asked for.
 *
 * Also rejects a value-taking flag whose "value" is actually the next flag
 * (e.g. `plan --in --dry-run`) — that is a missing value for `--in`, not a
 * filename that happens to start with "--", and must be reported as such
 * rather than silently swallowing `--dry-run` as `--in`'s value.
 *
 * `argv` is the full argument vector including the command at index 0 (the
 * same shape `parseArgs` takes).
 */
export function validateFlags(command: string, argv: string[]): void {
  const specs = [...(COMMAND_FLAGS[command] ?? []), { name: "help", takesValue: false }];
  const known = new Map(specs.map((s) => [s.name, s]));

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const name = token.slice(2);
    const spec = known.get(name);
    if (!spec) {
      const valid = specs.map((s) => `--${s.name}`).join(", ");
      throw new Error(`Unknown flag "${token}" for command "${command}". Valid flags: ${valid}`);
    }

    if (spec.takesValue) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(
          `--${name} requires a value, got ${next === undefined ? "nothing" : `"${next}"`}`,
        );
      }
      i += 1; // consume the value so it is never itself checked as a flag
    }
  }
}

/**
 * Validates `--max-change-ratio` at the CLI boundary, before it ever
 * reaches `assertPlanSane`. Two failure modes matter here, and neither
 * raises on its own: `Number("abc")` is `NaN`, which `??` does not catch
 * (only `assertPlanSane`'s own hardening catches that downstream); and
 * `Number("30")` is a valid, finite number that is simply the wrong unit —
 * an operator typing "30" meaning 30% when the ceiling is a 0–1 fraction
 * silently sets the ceiling to 3000%, i.e. effectively disables it.
 *
 * Returns `undefined` when the flag was not passed, so `assertPlanSane`'s
 * own default (0.3) applies untouched.
 */
export function parseMaxChangeRatio(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) {
    throw new Error(
      `--max-change-ratio must be a finite number in (0, 1] — a fraction of the CMS catalogue, ` +
        `not a percentage (e.g. 0.3, not 30). Got "${raw}".`,
    );
  }
  return n;
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
