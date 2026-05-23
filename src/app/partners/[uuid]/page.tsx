import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchPartnerDispatches } from "@/lib/dispatch/partner-dashboard-queries";
import { Kanban } from "@/components/partners/Kanban";

export const metadata: Metadata = {
  title: "Tableau partenaire",
  robots: { index: false, follow: false },
};

export default async function PartnerDashboardPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const partner = await findPartnerByToken(uuid);
  if (!partner) notFound();

  const dispatches = await fetchPartnerDispatches(partner.id);

  return (
    <main className="min-h-screen bg-background p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{partner.name}</h1>
        <p className="text-sm text-muted-foreground">
          {dispatches.length} {dispatches.length === 1 ? "lead" : "leads"}
        </p>
      </header>
      <Kanban partnerToken={uuid} dispatches={dispatches} />
    </main>
  );
}
