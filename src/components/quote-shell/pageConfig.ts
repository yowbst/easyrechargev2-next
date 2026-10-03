type Cfg = Record<string, unknown>;

const asList = (v: unknown): Cfg[] =>
  Array.isArray(v) ? v.filter((x): x is Cfg => !!x && typeof x === "object") : [];

/** Directus page config of one step (`config.steps[]`, matched on `id`). */
export function stepConfig(pageConfig: Cfg, stepId: string): Cfg {
  return asList(pageConfig.steps).find((s) => s.id === stepId) ?? {};
}

/** Directus page config of one field (`config.steps[].fields[]`, matched on `key`). */
export function fieldConfig(pageConfig: Cfg, stepId: string, key: string): Cfg {
  return asList(stepConfig(pageConfig, stepId).fields).find((f) => f.key === key) ?? {};
}

/** Tooltip image of a field, through the authenticated asset proxy. */
export function tooltipImageUrl(pageConfig: Cfg, stepId: string, key: string): string | undefined {
  const fc = fieldConfig(pageConfig, stepId, key);
  const id = fc.tooltipImage ?? (Array.isArray(fc.tooltipImages) ? fc.tooltipImages[0] : undefined);
  return typeof id === "string" && id ? `/api/cms/assets/${id}` : undefined;
}
