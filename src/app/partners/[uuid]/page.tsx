import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchPartnerDispatches } from "@/lib/dispatch/partner-dashboard-queries";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { Kanban } from "@/components/partners/Kanban";

export const metadata: Metadata = {
  title: "Tableau partenaire",
  robots: { index: false, follow: false },
};

const SUPPORT_EMAIL = "yoan@easyrecharge.ch";

function buildSupportMailto(opts: {
  partnerName: string;
  partnerSlug: string;
  dashboardToken: string;
}): string {
  const subject = `[Tableau partenaire] ${opts.partnerName} — `;
  const dashboardUrl = `https://easyrecharge.ch/partners/${opts.dashboardToken}`;
  const body = [
    "Bonjour Yoan,",
    "",
    "[Décris ici ta question ou ton problème.]",
    "",
    "---",
    `Partenaire : ${opts.partnerName} (${opts.partnerSlug})`,
    `Tableau : ${dashboardUrl}`,
    "",
  ].join("\n");
  const params = new URLSearchParams({ subject, body });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}

export default async function PartnerDashboardPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const partner = await findPartnerByToken(uuid);
  if (!partner) notFound();

  const [dispatches, config] = await Promise.all([
    fetchPartnerDispatches(partner.id),
    fetchDispatchConfig(),
  ]);

  const supportHref = buildSupportMailto({
    partnerName: partner.name,
    partnerSlug: partner.slug,
    dashboardToken: uuid,
  });

  return (
    <main className="min-h-screen bg-background p-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{partner.name}</h1>
          <p className="text-sm text-muted-foreground">
            {dispatches.length} {dispatches.length === 1 ? "lead" : "leads"}
          </p>
        </div>
        <a
          href={supportHref}
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Demander de l'aide"
          title="Demander de l'aide"
        >
          <LifeBuoy className="h-4 w-4" />
          <span className="hidden sm:inline">Aide</span>
        </a>
      </header>
      <Kanban
        partnerToken={uuid}
        lang={partner.language ?? "fr"}
        dispatches={dispatches}
        rottingDaysByStage={config.billing.rotting_days_by_stage}
        reasonsByStage={config.disqualification.reasons_by_stage}
      />
    </main>
  );
}
