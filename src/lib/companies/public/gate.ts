/**
 * Rollout gate for the nearby-installers block on commune pages, read from Directus
 * `site_settings.global_config.installers_block`:
 *   { "enabled": true, "cantons": ["VD"] }   one or more cantons
 *   { "enabled": true, "cantons": "*" }      every canton
 * Missing, malformed or `enabled: false` = off (the kill switch). French pages only.
 * The partner card is not gated.
 */
export function installersBlockEnabled(
  globalConfig: Record<string, unknown> | null | undefined,
  cantonCode: string,
  lang: string,
): boolean {
  if (lang !== "fr") return false;
  const cfg = globalConfig?.installers_block as { enabled?: unknown; cantons?: unknown } | undefined;
  if (!cfg || cfg.enabled !== true) return false;
  if (cfg.cantons === "*") return true;
  return Array.isArray(cfg.cantons) && cfg.cantons.some((c) => typeof c === "string" && c.toUpperCase() === cantonCode.toUpperCase());
}

/**
 * Title and H1 of a commune page once its installers block is on: the page then answers
 * "installation borne de recharge {commune}" as well as the subsidy question (GSC to
 * 2026-11-15: 56 commune installation queries, 655 impressions, 0 clicks on "Subventions…"
 * titles). First candidate that fits 60 characters wins, the last one otherwise.
 */
export function installerIntentTitles(locality: string): { title: string[]; h1: string } {
  return {
    title: [
      `Installation et subventions borne de recharge à ${locality}`,
      `Installation borne de recharge ${locality} et aides`,
      `Installation borne ${locality} et aides`,
    ],
    h1: `Borne de recharge à ${locality} : installateurs et subventions`,
  };
}
