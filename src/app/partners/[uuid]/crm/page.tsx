import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPartnerByToken } from "@/lib/partner-auth";
import {
  fetchPartnerDispatches,
  fetchPartnerCrmConfig,
} from "@/lib/dispatch/partner-dashboard-queries";
import { fetchPage } from "@/lib/directus-queries";
import { extractPageDictionary } from "@/lib/i18n/dictionaries";
import { slugToDirectusLocale } from "@/lib/i18n/config";
import { Kanban } from "@/components/partners/Kanban";
import { PartnerSidebar } from "@/components/partners/PartnerSidebar";

export const metadata: Metadata = {
  title: "CRM — Espace partenaire",
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
  const subject = `[CRM partenaire] ${opts.partnerName} — `;
  const crmUrl = `https://easyrecharge.ch/${opts.lang}/partners/${opts.dashboardToken}/crm`;
  const body = [
    "Bonjour Yoan,",
    "",
    "[Décris ici ta question ou ton problème.]",
    "",
    "---",
    `Partenaire : ${opts.partnerName} (${opts.partnerSlug})`,
    `CRM : ${crmUrl}`,
    "",
  ].join("\n");
  const params = new URLSearchParams({ subject, body });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}

export default async function PartnerCRMPage({
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
  const [dispatches, crmConfig, crmPage] = await Promise.all([
    fetchPartnerDispatches(partner.id),
    fetchPartnerCrmConfig(),
    fetchPage("partner-crm", locale),
  ]);
  const dictionary = crmPage
    ? extractPageDictionary("partner-crm", crmPage, locale)
    : {};

  const supportHref = buildSupportMailto({
    partnerName: partner.name,
    partnerSlug: partner.slug,
    dashboardToken: uuid,
    lang,
  });

  return (
    <PartnerSidebar
      partnerToken={uuid}
      partnerName={partner.name}
      leadCount={dispatches.length}
      supportHref={supportHref}
      activeNav="crm"
      lang={lang}
      dictionary={dictionary}
    >
      <Kanban
        partnerToken={uuid}
        lang={lang}
        dispatches={dispatches}
        rottingDaysByStage={crmConfig.rotting_days_by_stage}
        reasonsByStage={crmConfig.reasons_by_stage}
        dictionary={dictionary}
      />
    </PartnerSidebar>
  );
}
