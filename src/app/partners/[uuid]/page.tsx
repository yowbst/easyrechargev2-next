import { redirect } from "next/navigation";

/**
 * Default partner-space landing — redirects to the CRM (the kanban view).
 * Token validation happens at the destination.
 */
export default async function PartnerIndexPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  redirect(`/partners/${uuid}/crm`);
}
