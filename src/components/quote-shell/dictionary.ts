/**
 * Translation lookup for a quote funnel that reads several Directus pages:
 * its own (`pages.quote-battery.*`) first, then the charger page
 * (`pages.quote.*`) for the shared steps — contact, finalize, navigation —
 * so a new product only translates what differs.
 */
export function makeShellT(dictionary: Record<string, string>, pageIds: string[]) {
  const lookup = (key: string): string | undefined => {
    for (const id of pageIds) {
      const v = dictionary[`pages.${id}.${key}`];
      if (v && !v.startsWith("[")) return v;
    }
    return undefined;
  };

  const interpolate = (value: string, vars?: Record<string, string | number>) => {
    if (!vars) return value;
    let out = value;
    for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    return out;
  };

  /** Like t(): the full key comes back when nothing is translated. */
  const tq = (key: string, vars?: Record<string, string | number>) =>
    interpolate(lookup(key) ?? `pages.${pageIds[0]}.${key}`, vars);

  /** undefined when the key is missing or still a [placeholder]. */
  const tqOpt = (key: string) => lookup(key);

  return { tq, tqOpt };
}
