import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchPartnerInvoices } from "@/lib/billing/partner-queries";
import { fetchPartnerDispatches, fetchPartnerSectionPage } from "@/lib/dispatch/partner-dashboard-queries";
import { extractPageDictionary } from "@/lib/i18n/dictionaries";
import { slugToDirectusLocale } from "@/lib/i18n/config";
import { PartnerSidebar } from "@/components/partners/PartnerSidebar";
import { InvoiceList } from "@/components/partners/InvoiceList";

export const metadata: Metadata = {
  title: "Factures — Espace partenaire",
  robots: { index: false, follow: false },
};

const SUPPORTED_LANGS = ["fr", "de"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

export default async function PartnerInvoicesPage({
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
  const [invoices, dispatches, leadsPage, invoicesPage] = await Promise.all([
    fetchPartnerInvoices(partner.id),
    fetchPartnerDispatches(partner.id),
    fetchPartnerSectionPage("partner-leads", locale),
    fetchPartnerSectionPage("partner-invoices", locale),
  ]);
  // Partner-section i18n is split across Directus pages: partner-leads owns the
  // shared chrome (sidebar, header, filter), partner-invoices owns this view's
  // strings. Both must be merged or the whole sidebar renders as [key].
  const dictionary = {
    ...(leadsPage ? extractPageDictionary("partner-leads", leadsPage, locale) : {}),
    ...(invoicesPage ? extractPageDictionary("partner-invoices", invoicesPage, locale) : {}),
  };

  return (
    <PartnerSidebar
      partnerName={partner.name}
      partnerToken={uuid}
      leadCount={dispatches.length}
      supportHref={`mailto:yoan@easyrecharge.ch?subject=${encodeURIComponent(`[Factures] ${partner.name}`)}`}
      activeNav="invoices"
      lang={lang}
      dictionary={dictionary}
      facetOptions={{ housing: [], deadline: [], approval: [], score: [] }}
    >
      <InvoiceList invoices={invoices} dictionary={dictionary} lang={lang} />
    </PartnerSidebar>
  );
}
