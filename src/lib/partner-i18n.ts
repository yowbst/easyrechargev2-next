/**
 * Translation helper for the partner CRM.
 *
 * Translations live on the Directus `partner-crm` page and are flattened by
 * extractPageDictionary() into keys prefixed with `pages.partner-crm.`. This
 * helper hides that prefix and — matching the rest of the site's convention —
 * renders a missing key as `[key]` so untranslated strings are obvious.
 */

export type PartnerDict = Record<string, string>;

const PREFIX = "pages.partner-crm.";

export function partnerT(
  dict: PartnerDict,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let value = dict[PREFIX + key];
  if (value === undefined || value === "") return `[${key}]`;
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
