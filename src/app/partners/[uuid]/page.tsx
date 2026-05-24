import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchPartnerDispatches } from "@/lib/dispatch/partner-dashboard-queries";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { Kanban } from "@/components/partners/Kanban";
import { PartnerSidebar } from "@/components/partners/PartnerSidebar";

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
    <PartnerSidebar
      partnerName={partner.name}
      leadCount={dispatches.length}
      supportHref={supportHref}
    >
      <Kanban
        partnerToken={uuid}
        lang={partner.language ?? "fr"}
        dispatches={dispatches}
        rottingDaysByStage={config.billing.rotting_days_by_stage}
        reasonsByStage={config.disqualification.reasons_by_stage}
      />
    </PartnerSidebar>
  );
}
