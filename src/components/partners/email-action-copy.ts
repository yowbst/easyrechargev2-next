/**
 * Copy of the e-mail action page (`/partners/action/[token]`). The page reads
 * `email_action.*` from the partner-leads Directus dictionary first and falls
 * back to these strings, so it never shows a `[key]` before the Directus
 * translations exist. Stage and reason labels already live in Directus.
 */
const COPY = {
  fr: {
    "confirm.contacted": "Avez-vous contacté ce client ?",
    "confirm.appointment": "Avez-vous pris rendez-vous avec ce client ?",
    "confirm.quote_sent": "Avez-vous envoyé votre devis ?",
    "confirm.won": "Ce client a-t-il accepté votre devis ?",
    "confirm.move": "Le lead passera de « {from} » à « {to} » dans votre espace partenaire.",
    "confirm.button": "Confirmer",
    "open_leads": "Ouvrir mes leads",
    "done.title": "C'est noté, merci.",
    "done.stage": "Le lead est maintenant à l'étape « {to} ».",
    "done.disqualified": "Le lead est disqualifié.",
    "already_done.title": "Déjà à jour",
    "already_done.body": "Ce lead est déjà à l'étape « {stage} ».",
    "already_disqualified.title": "Lead disqualifié",
    "already_disqualified.body": "Ce lead a déjà été disqualifié.",
    "billing_locked.title": "Délai écoulé",
    "billing_locked.body": "Le délai pour disqualifier ce lead est écoulé. Pour toute question, contactez-nous.",
    "expired.title": "Ce lien a expiré",
    "expired.body": "Mettez le lead à jour depuis votre espace partenaire.",
    "error": "Une erreur est survenue. Réessayez ou passez par votre espace partenaire.",
    "dispatched_on": "Reçu le {date}",
  },
  de: {
    "confirm.contacted": "Haben Sie diesen Kunden kontaktiert?",
    "confirm.appointment": "Haben Sie einen Termin mit diesem Kunden vereinbart?",
    "confirm.quote_sent": "Haben Sie Ihre Offerte gesendet?",
    "confirm.won": "Hat dieser Kunde Ihre Offerte angenommen?",
    "confirm.move": "Der Lead wechselt in Ihrem Partnerbereich von «{from}» zu «{to}».",
    "confirm.button": "Bestätigen",
    "open_leads": "Meine Leads öffnen",
    "done.title": "Erledigt, danke.",
    "done.stage": "Der Lead ist jetzt in der Phase «{to}».",
    "done.disqualified": "Der Lead ist disqualifiziert.",
    "already_done.title": "Bereits aktuell",
    "already_done.body": "Dieser Lead ist bereits in der Phase «{stage}».",
    "already_disqualified.title": "Lead disqualifiziert",
    "already_disqualified.body": "Dieser Lead wurde bereits disqualifiziert.",
    "billing_locked.title": "Frist abgelaufen",
    "billing_locked.body": "Die Frist zur Disqualifizierung dieses Leads ist abgelaufen. Bei Fragen kontaktieren Sie uns.",
    "expired.title": "Dieser Link ist abgelaufen",
    "expired.body": "Aktualisieren Sie den Lead in Ihrem Partnerbereich.",
    "error": "Ein Fehler ist aufgetreten. Versuchen Sie es erneut oder nutzen Sie Ihren Partnerbereich.",
    "dispatched_on": "Erhalten am {date}",
  },
} as const;

export type EmailActionKey = keyof (typeof COPY)["fr"];

export function emailActionCopy(lang: "fr" | "de", key: EmailActionKey): string {
  return COPY[lang][key];
}
