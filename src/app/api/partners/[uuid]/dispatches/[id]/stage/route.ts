import { NextResponse } from "next/server";
import { directusFetch } from "@/lib/directus";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { shouldLockBilling } from "@/lib/dispatch/billing";
import { DISPATCH_STAGES, type DispatchStage } from "@/lib/dispatch/types";

interface Body {
  stage?: string;
}

interface DispatchRow {
  id: string;
  partner: string;
  stage: DispatchStage;
  stage_entered_at: string;
  stage_history: Array<{ stage: string; at: string }> | null;
  disqualified: boolean;
  gift: boolean;
  billable: boolean;
  billable_locked_at: string | null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uuid: string; id: string }> },
) {
  const { uuid, id } = await params;

  const partner = await findPartnerByToken(uuid);
  if (!partner) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body: Body = await req.json().catch(() => ({}));
  const newStage = body.stage as DispatchStage | undefined;
  if (!newStage || !DISPATCH_STAGES.includes(newStage)) {
    return NextResponse.json({ error: "invalid_stage" }, { status: 400 });
  }

  const fields =
    "id,partner,stage,stage_entered_at,stage_history,disqualified,gift,billable,billable_locked_at";
  const fetched = await directusFetch<{ data: DispatchRow | null }>(
    `/items/partner_dispatches/${id}?fields=${fields}`,
    { next: { revalidate: 0 } },
  );
  const row = fetched?.data ?? null;
  if (!row || row.partner !== partner.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (row.disqualified) {
    return NextResponse.json({ error: "already_disqualified" }, { status: 409 });
  }

  const config = await fetchDispatchConfig();
  const now = new Date().toISOString();
  const history = Array.isArray(row.stage_history) ? row.stage_history : [];

  const lockBilling = shouldLockBilling({
    newStage,
    previousStage: row.stage,
    previousStageEnteredAt: row.stage_entered_at,
    alreadyBillable: row.billable,
    disqualified: row.disqualified,
    gift: row.gift,
    billing: config.billing,
    partnerOverrides: partner.disqualification_overrides ?? null,
  });

  await directusFetch(`/items/partner_dispatches/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      stage: newStage,
      stage_entered_at: now,
      stage_history: [...history, { stage: newStage, at: now }],
      billable: lockBilling,
      billable_locked_at:
        lockBilling && !row.billable_locked_at ? now : row.billable_locked_at,
    }),
    next: { revalidate: 0 },
  });

  return NextResponse.json({ ok: true, stage: newStage, billable: lockBilling });
}
