export const cantonMapping: Record<string, string> = {
  'Aargau': 'AG',
  'Argovie': 'AG',
  'Appenzell Ausserrhoden': 'AR',
  'Appenzell Rhodes-Extérieures': 'AR',
  'Appenzell Innerrhoden': 'AI',
  'Appenzell Rhodes-Intérieures': 'AI',
  'Basel-Landschaft': 'BL',
  'Bâle-Campagne': 'BL',
  'Basel-Stadt': 'BS',
  'Bâle-Ville': 'BS',
  'Bern': 'BE',
  'Berne': 'BE',
  'Fribourg': 'FR',
  'Freiburg': 'FR',
  'Geneva': 'GE',
  'Genève': 'GE',
  'Genf': 'GE',
  'Glarus': 'GL',
  'Glaris': 'GL',
  'Graubünden': 'GR',
  'Grisons': 'GR',
  'Jura': 'JU',
  'Lucerne': 'LU',
  'Luzern': 'LU',
  'Neuchâtel': 'NE',
  'Neuenburg': 'NE',
  'Nidwalden': 'NW',
  'Obwalden': 'OW',
  'Schaffhausen': 'SH',
  'Schaffhouse': 'SH',
  'Schwyz': 'SZ',
  'Solothurn': 'SO',
  'Soleure': 'SO',
  'St. Gallen': 'SG',
  'Saint-Gall': 'SG',
  'Sankt Gallen': 'SG',
  'Ticino': 'TI',
  'Tessin': 'TI',
  'Thurgau': 'TG',
  'Thurgovie': 'TG',
  'Uri': 'UR',
  'Valais': 'VS',
  'Wallis': 'VS',
  'Vaud': 'VD',
  'Waadt': 'VD',
  'Zug': 'ZG',
  'Zoug': 'ZG',
  'Zürich': 'ZH',
  'Zurich': 'ZH',
};

/** Sorted list of all 26 Swiss canton 2-letter codes */
export const CANTON_CODES = [
  'AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR',
  'JU', 'LU', 'NE', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG',
  'TI', 'UR', 'VD', 'VS', 'ZG', 'ZH',
] as const;

export function getCantonCode(name: string): string | undefined {
  if (!name) return undefined;
  
  // Direct match
  if (cantonMapping[name]) {
    return cantonMapping[name];
  }
  
  // Case-insensitive match
  const normalizedName = name.trim();
  const match = Object.keys(cantonMapping).find(
    key => key.toLowerCase() === normalizedName.toLowerCase()
  );
  
  return match ? cantonMapping[match] : undefined;
}
