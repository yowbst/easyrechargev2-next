/** Specialty keys the cards can show, with their French label. Order = display priority. */
export const SPECIALTIES = {
  bornes: "Bornes de recharge",
  photovoltaique: "Photovoltaïque",
  courant_fort: "Courant fort",
  courant_faible: "Courant faible",
  domotique: "Domotique",
  telecom: "Télécom & réseaux",
  securite: "Sécurité & alarmes",
  eclairage: "Éclairage",
  chauffage: "Chauffage & énergie",
  controles: "Contrôles OIBT",
  depannage: "Dépannage",
} as const;

export type SpecialtyKey = keyof typeof SPECIALTIES;

export function isSpecialtyKey(k: unknown): k is SpecialtyKey {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(SPECIALTIES, k);
}
