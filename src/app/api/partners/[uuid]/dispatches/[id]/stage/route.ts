import { NextResponse } from "next/server";
import { directusFetch } from "@/lib/directus";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { shouldLockBilling } from "@/lib/dispatch/billing";
import {
  DISPATCH_STAGES,
  LOST_REASONS,
  STAGE_RANK,
  canMoveStage,
  type DispatchStage,
  type LostReason,
} from "@/lib/dispatch/types";

interface Body {
  stage?: string;
  lost_reason?: string;
  lost_note?: string;
}

interface DispatchRow {
  id: string;
  partner: string;
  stage: DispatchStage;
  stage_entered_at: string;
  stage_history: Array<{ stage: string; at: string }> | null;
  dispatched_at: string;
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
    "id,partner,stage,stage_entered_at,stage_history,dispatched_at,disqualified,gift,billable,billable_locked_at";
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
  // Reopening: a closed lead (won/lost) can be moved back into the active
  // pipeline. This is the one sanctioned backward transition — billing stays
  // locked (the lead was already worked) and the lost reason is cleared.
  const isReopen =
    (row.stage === "won" || row.stage === "lost") &&
    STAGE_RANK[newStage] < STAGE_RANK.won;
  if (!isReopen && !canMoveStage(row.stage, newStage)) {
    return NextResponse.json({ error: "backward_stage" }, { status: 409 });
  }

  // Marking a lead Lost requires a reason (sales outcome — kept distinct from
  // a disqualification). 'other' must carry an explanatory note.
  let lostReason: LostReason | null = null;
  let lostNote: string | null = null;
  if (newStage === "lost") {
    const reason = body.lost_reason;
    if (!reason || !LOST_REASONS.includes(reason as LostReason)) {
      return NextResponse.json({ error: "lost_reason_required" }, { status: 400 });
    }
    const note = body.lost_note?.trim() ?? "";
    if (reason === "other" && note.length === 0) {
      return NextResponse.json(
        { error: "lost_note_required_for_other" },
        { status: 400 },
      );
    }
    lostReason = reason as LostReason;
    lostNote = note.length > 0 ? note : null;
  }

  const config = await fetchDispatchConfig();
  const now = new Date().toISOString();
  const history = Array.isArray(row.stage_history) ? row.stage_history : [];

  // Reopening never un-bills a lead that was already worked.
  const lockBilling = isReopen
    ? row.billable
    : shouldLockBilling({
        newStage,
        dispatchedAt: row.dispatched_at,
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
      ...(newStage === "lost"
        ? { lost_reason: lostReason, lost_note: lostNote }
        : isReopen
          ? { lost_reason: null, lost_note: null }
          : {}),
    }),
    next: { revalidate: 0 },
  });

  return NextResponse.json({ ok: true, stage: newStage, billable: lockBilling });
}
