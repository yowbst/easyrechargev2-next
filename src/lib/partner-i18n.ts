/**
 * Translation helper for the partner section.
 *
 * Translations live on a handful of Directus pages (`partner-leads` for the
 * Leads view + shared chrome, `partner-stats` for stats-specific strings) and
 * are flattened by extractPageDictionary() into `pages.<routeId>.*` keys.
 * This helper hides that prefix, tries each partner-section prefix in order,
 * and — matching the rest of the site's convention — renders a missing key
 * as `[key]` so untranslated strings are obvious.
 */

export type PartnerDict = Record<string, string>;

// Order matters: the Leads page owns the shared chrome (sidebar, filter, card,
// modals…) and stats-specific strings live on partner-stats. A key is looked
// up in each prefix and the first hit wins.
const PREFIXES = ["pages.partner-leads.", "pages.partner-stats."] as const;

export function partnerT(
  dict: PartnerDict,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let value: string | undefined;
  for (const prefix of PREFIXES) {
    const v = dict[prefix + key];
    if (v !== undefined && v !== "") {
      value = v;
      break;
    }
  }
  if (value === undefined) return `[${key}]`;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}

/** Bind a dictionary into a `t(key, vars?)` closure for ergonomic use in components. */
export function makePartnerT(dict: PartnerDict) {
  return (key: string, vars?: Record<string, string | number>) =>
    partnerT(dict, key, vars);
}

export type PartnerT = ReturnType<typeof makePartnerT>;
