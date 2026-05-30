import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPartnerByToken } from "@/lib/partner-auth";
import {
  fetchPartnerDispatches,
  fetchPartnerLeadsConfig,
} from "@/lib/dispatch/partner-dashboard-queries";
import { resolveWeights } from "@/lib/dispatch/scoring";
import { collectFacetOptions } from "@/lib/partner-facets";
import { fetchPage } from "@/lib/directus-queries";
import { extractPageDictionary } from "@/lib/i18n/dictionaries";
import { slugToDirectusLocale } from "@/lib/i18n/config";
import { Kanban } from "@/components/partners/Kanban";
import { PartnerSidebar } from "@/components/partners/PartnerSidebar";

export const metadata: Metadata = {
  title: "Leads — Espace partenaire",
  robots: { index: false, follow: false },
};

const SUPPORTED_LANGS = ["fr", "de"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

const SUPPORT_EMAIL = "yoan@easyrecharge.ch";

function buildSupportMailto(opts: {
  partnerName: string;
  partnerSlug: string;
  dashboardToken: string;
  lang: string;
}): string {
  const subject = `[Leads partenaire] ${opts.partnerName} — `;
  const leadsUrl = `https://easyrecharge.ch/${opts.lang}/partners/${opts.dashboardToken}/leads`;
  const body = [
    "Bonjour Yoan,",
    "",
    "[Décris ici ta question ou ton problème.]",
    "",
    "---",
    `Partenaire : ${opts.partnerName} (${opts.partnerSlug})`,
    `Leads : ${leadsUrl}`,
    "",
  ].join("\n");
  const params = new URLSearchParams({ subject, body });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}

export default async function PartnerLeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { uuid } = await params;
  const { lang: langParam } = await searchParams;
  const lang: Lang =
    langParam && (SUPPORTED_LANGS as readonly string[]).includes(langParam)
      ? (langParam as Lang)
      : "fr";

  const partner = await findPartnerByToken(uuid);
  if (!partner) notFound();

  const locale = slugToDirectusLocale(lang);
  const [dispatches, leadsConfig, leadsPage] = await Promise.all([
    fetchPartnerDispatches(partner.id),
    fetchPartnerLeadsConfig(),
    fetchPage("partner-leads", locale),
  ]);
  const dictionary = leadsPage
    ? extractPageDictionary("partner-leads", leadsPage, locale)
    : {};

  const supportHref = buildSupportMailto({
    partnerName: partner.name,
    partnerSlug: partner.slug,
    dashboardToken: uuid,
    lang,
  });

  const scoringWeights = resolveWeights(partner.lead_scoring_weights);
  const facetOptions = collectFacetOptions(dispatches, scoringWeights);

  return (
    <PartnerSidebar
      partnerToken={uuid}
      partnerName={partner.name}
      leadCount={dispatches.length}
      supportHref={supportHref}
      activeNav="leads"
      lang={lang}
      dictionary={dictionary}
      facetOptions={facetOptions}
    >
      <Kanban
        partnerToken={uuid}
        lang={lang}
        dispatches={dispatches}
        rottingDaysByStage={leadsConfig.rotting_days_by_stage}
        reasonsByStage={leadsConfig.reasons_by_stage}
        scoringWeights={scoringWeights}
        dictionary={dictionary}
      />
    </PartnerSidebar>
  );
}
