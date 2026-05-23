import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Tag } from "lucide-react";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchPartnerDispatchDetail } from "@/lib/dispatch/partner-dashboard-queries";

export const metadata: Metadata = {
  title: "Demande de devis",
  robots: { index: false, follow: false },
};

const STAGE_LABELS: Record<string, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  appointment: "RDV pris",
  quote_sent: "Devis envoyé",
  won: "Gagné",
  lost: "Perdu",
};

const REASON_LABELS: Record<string, string> = {
  partner_already_has: "Lead déjà reçu directement",
  dedup: "Lead déjà transmis récemment",
  unreachable: "Lead injoignable",
  not_engaging: "Lead ne souhaite pas s'engager",
  competitor: "Lead a choisi un concurrent",
  long_timeframe: "Projet au-delà de 12 mois",
  no_authorization: "Lead n'a pas l'autorisation",
};

const CATEGORY_LABELS: Record<string, string> = {
  owner_no_solar: "Propriétaire, sans installation solaire",
  owner_solar: "Propriétaire, avec installation solaire",
  co_owner_no_solar: "Copropriétaire, sans installation solaire",
  co_owner_solar: "Copropriétaire, avec installation solaire",
  tenant_no_solar: "Locataire, sans installation solaire",
  tenant_solar: "Locataire, avec installation solaire",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ uuid: string; dispatchId: string }>;
}) {
  const { uuid, dispatchId } = await params;
  const partner = await findPartnerByToken(uuid);
  if (!partner) notFound();
  const detail = await fetchPartnerDispatchDetail(dispatchId, partner.id);
  if (!detail) notFound();

  const user = detail.submission?.user;
  const data = (detail.submission?.data ?? {}) as Record<string, unknown>;
  const firstName = user?.first_name ?? "—";
  const lastName = user?.last_name ?? "";
  const fullName = `${firstName} ${lastName}`.trim();

  const formFields: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined || v === "") continue;
    if (["firstName", "lastName", "email", "phone", "phoneCountry"].includes(k))
      continue;
    formFields.push([k, typeof v === "object" ? JSON.stringify(v) : String(v)]);
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-background p-6">
      <Link
        href={`/partners/${uuid}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour au tableau
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold">{fullName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Demande reçue le {fmtDate(detail.dispatched_at)}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Contact
          </h2>
          <dl className="space-y-2 text-sm">
            {user?.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${user.email}`} className="hover:underline">
                  {user.email}
                </a>
              </div>
            )}
            {user?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${user.phone}`} className="hover:underline">
                  {user.phone}
                </a>
              </div>
            )}
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>Canton {detail.canton}</span>
            </div>
            {user?.language && (
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span>Langue: {user.language}</span>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Lead
          </h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Catégorie</dt>
              <dd className="font-mono">{detail.lead_category ?? "—"}</dd>
              {detail.lead_category && CATEGORY_LABELS[detail.lead_category] && (
                <dd className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[detail.lead_category]}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Stage actuel</dt>
              <dd>
                {STAGE_LABELS[detail.stage] ?? detail.stage}{" "}
                <span className="text-xs text-muted-foreground">
                  (depuis le {fmtDate(detail.stage_entered_at)})
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Facturation</dt>
              <dd>
                {detail.gift
                  ? "Gift — non facturé"
                  : detail.billable
                    ? "Verrouillé pour facturation"
                    : "En cours (peut encore être disqualifié)"}
              </dd>
            </div>
            {detail.disqualified && (
              <div>
                <dt className="text-xs text-muted-foreground">Disqualifié</dt>
                <dd className="text-rose-700">
                  {REASON_LABELS[detail.disqualification_reason ?? ""] ??
                    detail.disqualification_reason}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  le {fmtDate(detail.disqualified_at)}
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {formFields.length > 0 && (
        <section className="mt-4 rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Détails de la demande
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {formFields.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {detail.stage_history && detail.stage_history.length > 0 && (
        <section className="mt-4 rounded-lg border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Historique
          </h2>
          <ol className="space-y-1 text-sm">
            {detail.stage_history.map((entry, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2">
                <span>{STAGE_LABELS[entry.stage] ?? entry.stage}</span>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(entry.at)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
