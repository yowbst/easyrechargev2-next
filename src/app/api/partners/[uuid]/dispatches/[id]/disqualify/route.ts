import { NextResponse } from "next/server";
import { directusFetch } from "@/lib/directus";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { isAcceptanceExpired } from "@/lib/dispatch/billing";
import {
  DISQUALIFICATION_REASONS,
  type DispatchStage,
  type DisqualificationReason,
} from "@/lib/dispatch/types";

interface Body {
  reason?: string;
  note?: string;
}

interface DispatchRow {
  id: string;
  partner: string;
  stage: DispatchStage;
  dispatched_at: string;
  disqualified: boolean;
  gift: boolean;
  billable: boolean;
  billable_locked_at: string | null;
}

const MAX_NOTE_LENGTH = 2000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uuid: string; id: string }> },
) {
  const { uuid, id } = await params;

  const partner = await findPartnerByToken(uuid);
  if (!partner) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body: Body = await req.json().catch(() => ({}));
  const reason = body.reason as DisqualificationReason | undefined;
  if (!reason || !DISQUALIFICATION_REASONS.includes(reason)) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 });
  }
  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim().slice(0, MAX_NOTE_LENGTH)
      : null;

  const fields =
    "id,partner,stage,dispatched_at,disqualified,gift,billable,billable_locked_at";
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
  if (row.billable_locked_at) {
    return NextResponse.json({ error: "billing_locked" }, { status: 409 });
  }

  const config = await fetchDispatchConfig();

  // Stage-specific reason validation. Missing key in config = all reasons allowed.
  const stageReasons = config.disqualification.reasons_by_stage[row.stage];
  if (Array.isArray(stageReasons) && stageReasons.length > 0 && !stageReasons.includes(reason)) {
    return NextResponse.json({ error: "reason_not_allowed_for_stage" }, { status: 400 });
  }

  const expired = isAcceptanceExpired(
    row.dispatched_at,
    config.billing,
    partner.disqualification_overrides ?? null,
  );
  if (expired) {
    // Lock billing now (unless gift) and refuse the disqualification.
    const now = new Date().toISOString();
    await directusFetch(`/items/partner_dispatches/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ billable: !row.gift, billable_locked_at: now }),
      next: { revalidate: 0 },
    });
    return NextResponse.json({ error: "window_expired" }, { status: 409 });
  }

  const now = new Date().toISOString();
  await directusFetch(`/items/partner_dispatches/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      disqualified: true,
      disqualification_reason: reason,
      disqualification_note: note,
      disqualified_at: now,
      billable: false,
      billable_locked_at: now,
    }),
    next: { revalidate: 0 },
  });

  return NextResponse.json({ ok: true, reason });
}
