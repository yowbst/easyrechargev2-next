/**
 * The 26 cantons, with the French and German names the pages need. Canton names are not
 * readable with the app token (the `cantons` collection answers 403), and they never change.
 */
export interface CantonInfo {
  code: string;
  nameFr: string;
  nameDe: string;
  /** "du Valais", "de Vaud": what follows "canton" in French. */
  ofFr: string;
}

export const CANTONS_INFO: Record<string, CantonInfo> = {
  AG: { code: "AG", nameFr: "Argovie", nameDe: "Aargau", ofFr: "d'Argovie" },
  AI: { code: "AI", nameFr: "Appenzell Rhodes-Intérieures", nameDe: "Appenzell Innerrhoden", ofFr: "d'Appenzell Rhodes-Intérieures" },
  AR: { code: "AR", nameFr: "Appenzell Rhodes-Extérieures", nameDe: "Appenzell Ausserrhoden", ofFr: "d'Appenzell Rhodes-Extérieures" },
  BE: { code: "BE", nameFr: "Berne", nameDe: "Bern", ofFr: "de Berne" },
  BL: { code: "BL", nameFr: "Bâle-Campagne", nameDe: "Basel-Landschaft", ofFr: "de Bâle-Campagne" },
  BS: { code: "BS", nameFr: "Bâle-Ville", nameDe: "Basel-Stadt", ofFr: "de Bâle-Ville" },
  FR: { code: "FR", nameFr: "Fribourg", nameDe: "Freiburg", ofFr: "de Fribourg" },
  GE: { code: "GE", nameFr: "Genève", nameDe: "Genf", ofFr: "de Genève" },
  GL: { code: "GL", nameFr: "Glaris", nameDe: "Glarus", ofFr: "de Glaris" },
  GR: { code: "GR", nameFr: "Grisons", nameDe: "Graubünden", ofFr: "des Grisons" },
  JU: { code: "JU", nameFr: "Jura", nameDe: "Jura", ofFr: "du Jura" },
  LU: { code: "LU", nameFr: "Lucerne", nameDe: "Luzern", ofFr: "de Lucerne" },
  NE: { code: "NE", nameFr: "Neuchâtel", nameDe: "Neuenburg", ofFr: "de Neuchâtel" },
  NW: { code: "NW", nameFr: "Nidwald", nameDe: "Nidwalden", ofFr: "de Nidwald" },
  OW: { code: "OW", nameFr: "Obwald", nameDe: "Obwalden", ofFr: "d'Obwald" },
  SG: { code: "SG", nameFr: "Saint-Gall", nameDe: "St. Gallen", ofFr: "de Saint-Gall" },
  SH: { code: "SH", nameFr: "Schaffhouse", nameDe: "Schaffhausen", ofFr: "de Schaffhouse" },
  SO: { code: "SO", nameFr: "Soleure", nameDe: "Solothurn", ofFr: "de Soleure" },
  SZ: { code: "SZ", nameFr: "Schwytz", nameDe: "Schwyz", ofFr: "de Schwytz" },
  TG: { code: "TG", nameFr: "Thurgovie", nameDe: "Thurgau", ofFr: "de Thurgovie" },
  TI: { code: "TI", nameFr: "Tessin", nameDe: "Tessin", ofFr: "du Tessin" },
  UR: { code: "UR", nameFr: "Uri", nameDe: "Uri", ofFr: "d'Uri" },
  VD: { code: "VD", nameFr: "Vaud", nameDe: "Waadt", ofFr: "de Vaud" },
  VS: { code: "VS", nameFr: "Valais", nameDe: "Wallis", ofFr: "du Valais" },
  ZG: { code: "ZG", nameFr: "Zoug", nameDe: "Zug", ofFr: "de Zoug" },
  ZH: { code: "ZH", nameFr: "Zurich", nameDe: "Zürich", ofFr: "de Zurich" },
};

/** Cantons with an installation page (served cantons). URL slug -> canton code. French only. */
export const CANTON_PAGE_SLUGS: Record<string, string> = {
  vaud: "VD",
  valais: "VS",
  fribourg: "FR",
  geneve: "GE",
  neuchatel: "NE",
};

export function cantonPageSlug(code: string): string | null {
  return Object.entries(CANTON_PAGE_SLUGS).find(([, c]) => c === code)?.[0] ?? null;
}
