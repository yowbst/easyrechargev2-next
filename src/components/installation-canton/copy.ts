/**
 * Fallback copy for the canton installation pages (French only). Figures are never
 * written here: every number on the page comes from live data (register, subsidy
 * survey, charger catalog) with its source and date. A Directus `installation-canton`
 * page can override this copy later.
 *
 * CANTON_PARAGRAPHS: drafted 2026-11-22, TO BE REVIEWED by Yoan before publishing.
 * Geography only, no claim on prices, certification, delays or partner coverage.
 */

export const CANTON_ADJECTIVE: Record<string, string> = {
  VD: "vaudois",
  VS: "valaisan",
  FR: "fribourgeois",
  GE: "genevois",
  NE: "neuchâtelois",
};

export const CANTON_PARAGRAPHS: Record<string, string> = {
  VD:
    "De l'arc lémanique au Nord vaudois, en passant par la Broye, le Gros-de-Vaud et le Chablais, " +
    "les entreprises d'installation électrique sont réparties dans tout le canton. " +
    "Villa, immeuble locatif ou appartement en PPE : la demande de devis passe par le même formulaire.",
  VS:
    "Le Valais s'étend le long du Rhône, du Léman à la vallée de Conches, et parle deux langues. " +
    "Votre demande est traitée de la même manière, que vous habitiez la plaine, une station ou un village de montagne.",
  FR:
    "Canton bilingue, Fribourg va de la Gruyère au Lac et de la Broye à la Singine. " +
    "Maison individuelle ou copropriété, la demande de devis passe par le même formulaire.",
  GE:
    "De la ville aux communes de la campagne genevoise, en appartement comme en villa : " +
    "en immeuble, l'installation d'une borne passe par la copropriété ou la régie. Décrivez votre situation dans la demande, le devis en tient compte.",
  NE:
    "Du Littoral aux Montagnes neuchâteloises, en passant par le Val-de-Ruz et le Val-de-Travers, " +
    "la demande de devis passe par le même formulaire, en maison comme en immeuble.",
};

export const COPY = {
  breadcrumb: "Installation",
  h1: (ofCanton: string) => `Installation de borne de recharge dans le canton ${ofCanton}`,
  introPartner:
    "Décrivez votre projet en quelques minutes : votre demande est transmise au partenaire easyRecharge du canton, qui vous recontacte pour établir le devis.",
  introNoPartner:
    "Décrivez votre projet en quelques minutes : nous recherchons un installateur pour votre demande et vous recontactons pour le devis.",
  statsHeading: "Le canton en chiffres",
  installersHeading: "Électriciens installateurs dans le canton",
  installersLead: (shown: number, total: number) =>
    `${shown} entreprises sur ${total}, une par localité parmi celles qui en comptent le plus.`,
  localitiesHeading: "Aides et installateurs par localité",
  localitiesLead:
    "Chaque page de localité détaille les aides recensées pour une borne privée et leurs conditions.",
  subsidiesHeading: "Aides pour une borne privée",
  faqHeading: "Questions fréquentes",
  methodHeading: "Comment nous comptons les installateurs",
  method:
    "Nous lisons le but social de chaque entreprise inscrite au registre du commerce et retenons celles qui décrivent des travaux d'installation électrique. " +
    "Le tri est automatique et contrôlé sur un échantillon ; il se trompe environ une fois sur dix. " +
    "Les entreprises en liquidation sont exclues. Aucune mention ne vaut autorisation d'installer.",
  optOutLead: "Vous représentez une entreprise listée ?",
  optOutLink: "Écrivez-nous",
  optOutTail: "pour une correction ou un retrait.",
  cta: "Demander un devis",
  ctaTitlePartner: (adjective: string) => `Votre borne installée par notre partenaire ${adjective}`,
  ctaTitleNoPartner: (ofCanton: string) => `Votre borne installée dans le canton ${ofCanton}`,
  ctaSubtitlePartner: (name: string) => `Décrivez votre logement et votre véhicule, ${name} vous recontacte avec un devis.`,
  ctaSubtitleNoPartner: "Décrivez votre logement et votre véhicule, nous vous recontactons avec un devis.",
} as const;
