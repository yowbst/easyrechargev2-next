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

  const body: { reason?: string; note?: string } = await req.json().catch(() => ({}));
  const result = await act(
    id,
    { kind: "partner", partnerId: partner.id, source: "kanban" },
    { type: "disqualify", reason: body.reason ?? "", note: body.note },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, reason: body.reason });
}
