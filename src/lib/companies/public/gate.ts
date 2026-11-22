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
