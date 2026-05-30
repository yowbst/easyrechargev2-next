import { redirect } from "next/navigation";

/**
 * Back-compat redirect — old, lang-less partner URLs land on the French Leads
 * view. The canonical home is /[lang]/partners/[uuid]/leads.
 */
export default async function PartnerIndexPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  redirect(`/fr/partners/${uuid}/leads`);
}
