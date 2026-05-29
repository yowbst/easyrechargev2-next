import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchPartnerDispatches } from "@/lib/dispatch/partner-dashboard-queries";
import { resolveWeights } from "@/lib/dispatch/scoring";
import { fetchPage } from "@/lib/directus-queries";
import { extractPageDictionary } from "@/lib/i18n/dictionaries";
import { slugToDirectusLocale } from "@/lib/i18n/config";
import { PartnerSidebar } from "@/components/partners/PartnerSidebar";
import { StatsBoard } from "@/components/partners/StatsBoard";

export const metadata: Metadata = {
  title: "Statistiques — Espace partenaire",
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
  const subject = `[Stats partenaire] ${opts.partnerName} — `;
  const url = `https://easyrecharge.ch/${opts.lang}/partners/${opts.dashboardToken}/stats`;
  const body = [
    "Bonjour Yoan,",
    "",
    "[Décris ici ta question ou ton problème.]",
    "",
    "---",
    `Partenaire : ${opts.partnerName} (${opts.partnerSlug})`,
    `Stats : ${url}`,
    "",
  ].join("\n");
  const params = new URLSearchParams({ subject, body });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}

export default async function PartnerStatsPage({
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
  const [dispatches, page] = await Promise.all([
    fetchPartnerDispatches(partner.id),
    fetchPage("partner-crm", locale),
  ]);
  const dictionary = page ? extractPageDictionary("partner-crm", page, locale) : {};

  const scoringWeights = resolveWeights(partner.lead_scoring_weights);
  const supportHref = buildSupportMailto({
    partnerName: partner.name,
    partnerSlug: partner.slug,
    dashboardToken: uuid,
    lang,
  });

  // Facet options aren't relevant on this page (no per-card filtering yet),
  // but the sidebar prop is required → pass empty arrays.
  const facetOptions = { housing: [], deadline: [], approval: [], score: [] };

  return (
    <PartnerSidebar
      partnerToken={uuid}
      partnerName={partner.name}
      leadCount={dispatches.length}
      supportHref={supportHref}
      activeNav="stats"
      lang={lang}
      dictionary={dictionary}
      facetOptions={facetOptions}
    >
      <StatsBoard
        dispatches={dispatches}
        scoringWeights={scoringWeights}
        dictionary={dictionary}
      />
    </PartnerSidebar>
  );
}
