import { t } from "@/lib/i18n/dictionaries";

/**
 * Dictionary helpers for the Direction B home page.
 *
 * `t()` echoes the key back when a string is missing, and some paths render
 * `[key]` instead. Either way an untranslated section must not reach the page,
 * so every section below is built from `opt()` and skipped when it comes back
 * empty. That is what lets the new blocks ship before their Directus content
 * exists, in both languages, without a single `[key]` on screen.
 */
export function opt(
  dictionary: Record<string, string>,
  key: string,
  vars?: Record<string, string | number>,
): string | undefined {
  const value = t(dictionary, key, vars);
  if (!value || value === key || value.startsWith("[")) return undefined;
  return value;
}

/**
 * Collect `…<prefix>.<i>.<field>` groups for i = 0, 1, 2 … stopping at the
 * first index whose `required` field is absent. Indices are authored as a
 * list in Directus, so a gap means the end rather than a hole.
 */
export function optList<T>(
  dictionary: Record<string, string>,
  prefix: string,
  build: (at: (field: string) => string | undefined, index: number) => T | null,
  max = 8,
): T[] {
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    const at = (field: string) =>
      opt(dictionary, field ? `${prefix}.${i}.${field}` : `${prefix}.${i}`);
    const item = build(at, i);
    if (!item) break;
    out.push(item);
  }
  return out;
}
