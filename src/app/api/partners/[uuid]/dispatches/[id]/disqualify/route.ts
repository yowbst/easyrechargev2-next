import { NextResponse } from "next/server";
import { findPartnerByToken } from "@/lib/partner-auth";
import { disqualifyDispatch } from "@/lib/dispatch/partner-actions";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uuid: string; id: string }> },
) {
  const { uuid, id } = await params;

  const partner = await findPartnerByToken(uuid);
  if (!partner) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const result = await disqualifyDispatch(partner, id, body, "kanban");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, reason: result.reason });
}
