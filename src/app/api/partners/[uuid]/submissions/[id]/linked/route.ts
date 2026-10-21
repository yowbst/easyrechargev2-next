import { NextResponse } from "next/server";
import { findPartnerByToken } from "@/lib/partner-auth";
import { storage } from "@/lib/directus-storage";
import { partnerHoldsSubmission } from "@/lib/dispatch/partner-dashboard-queries";

/**
 * The other request of the same send (charger ↔ battery add-on), for the lead
 * page opened from the partner board — only when this partner holds both.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uuid: string; id: string }> },
) {
  const { uuid, id } = await params;
  const partner = await findPartnerByToken(uuid);
  if (!partner) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const none = NextResponse.json({ linked: null });
  if (!(await partnerHoldsSubmission(partner.id, id))) return none;

  const found = await storage.getSubmissionById(id);
  const raw = found?.submission.linked_submission;
  const linkedId = typeof raw === "string" ? raw : raw?.id;
  if (!linkedId || !(await partnerHoldsSubmission(partner.id, linkedId))) return none;

  const linked = await storage.getSubmissionById(linkedId);
  return NextResponse.json({ linked: { id: linkedId, product: linked?.submission.product ?? null } });
}
