import { NextResponse } from "next/server";
import { findPartnerByToken } from "@/lib/partner-auth";
import { act } from "@/lib/dispatch/lifecycle";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uuid: string; id: string }> },
) {
  const { uuid, id } = await params;

  const partner = await findPartnerByToken(uuid);
  if (!partner) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body: { stage?: string; lost_reason?: string; lost_note?: string } = await req
    .json()
    .catch(() => ({}));
  const result = await act(
    id,
    { kind: "partner", partnerId: partner.id, source: "kanban" },
    { type: "move", stage: body.stage ?? "", lostReason: body.lost_reason, lostNote: body.lost_note },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, stage: result.stage, billable: result.billable });
}
