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
import { StatsTabs } from "@/components/partners/stats/StatsTabs";
import { makePartnerT } from "@/lib/partner-i18n";

const STATS_TABS = ["general"] as const;
type StatsTabKey = (typeof STATS_TABS)[number];
const DEFAULT_TAB: StatsTabKey = "general";

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
  searchParams: Promise<{ lang?: string; tab?: string }>;
}) {
  const { uuid } = await params;
  const { lang: langParam, tab: tabParam } = await searchParams;
  const lang: Lang =
    langParam && (SUPPORTED_LANGS as readonly string[]).includes(langParam)
      ? (langParam as Lang)
      : "fr";
  const tab: StatsTabKey =
    tabParam && (STATS_TABS as readonly string[]).includes(tabParam)
      ? (tabParam as StatsTabKey)
      : DEFAULT_TAB;

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

  const t = makePartnerT(dictionary);
  const tabs = STATS_TABS.map((key) => ({
    key,
    label: t(`stats.tabs.${key}`),
  }));

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
      statsTabs={tabs}
      activeStatsTab={tab}
      defaultStatsTab={DEFAULT_TAB}
    >
      <div className="space-y-4">
        <StatsTabs active={tab} defaultKey={DEFAULT_TAB} tabs={tabs} />
        {tab === "general" && (
          <StatsBoard
            dispatches={dispatches}
            scoringWeights={scoringWeights}
            dictionary={dictionary}
          />
        )}
      </div>
    </PartnerSidebar>
  );
}
