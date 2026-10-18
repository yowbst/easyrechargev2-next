import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPartnerById } from "@/lib/partner-auth";
import {
  fetchDispatchCardById,
  fetchPartnerLeadsConfig,
  fetchPartnerSectionPage,
} from "@/lib/dispatch/partner-dashboard-queries";
import { actionBlocker, verifyDispatchAction } from "@/lib/dispatch/action-token";
import { extractPageDictionary } from "@/lib/i18n/dictionaries";
import { slugToDirectusLocale } from "@/lib/i18n/config";
import { EmailActionConfirm, type EmailActionState } from "@/components/partners/EmailActionConfirm";

export const metadata: Metadata = {
  title: "easyRecharge — Espace partenaire",
  robots: { index: false, follow: false },
};

/**
 * Landing page of an e-mail action button ("Contacté", "Disqualifier"…).
 * Rendering it never writes: mail scanners open links before the partner
 * does. The Confirm button POSTs to /api/partners/action.
 */
export default async function EmailActionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyDispatchAction(token);
  if (verified.status === "invalid") notFound();

  const { d: dispatchId, a: action } = verified.payload;
  const dispatch = await fetchDispatchCardById(dispatchId);
  const partner = dispatch ? await findPartnerById(dispatch.partner) : null;
  if (!dispatch || !partner) notFound();

  const lang = partner.language === "de" ? "de" : "fr";
  const locale = slugToDirectusLocale(lang);
  const [leadsConfig, leadsPage] = await Promise.all([
    fetchPartnerLeadsConfig(),
    fetchPartnerSectionPage("partner-leads", locale),
  ]);
  const dictionary = leadsPage ? extractPageDictionary("partner-leads", leadsPage, locale) : {};

  const initialState: EmailActionState =
    verified.status === "expired" ? "expired" : (actionBlocker(dispatch, action) ?? "ready");
  const leadsHref = partner.dashboard_token ? `/${lang}/partners/${partner.dashboard_token}/leads` : "/";

  return (
    <EmailActionConfirm
      token={token}
      action={action}
      initialState={initialState}
      dispatch={dispatch}
      dictionary={dictionary}
      allowedReasons={leadsConfig.reasons_by_stage[dispatch.stage] ?? null}
      lang={lang}
      leadsHref={leadsHref}
    />
  );
}
