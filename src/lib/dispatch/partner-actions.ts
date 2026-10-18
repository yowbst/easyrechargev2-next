import { directusFetch } from "@/lib/directus";
import { fetchDispatchConfig } from "@/lib/dispatch/queries";
import { fetchPartnerLeadsConfig } from "@/lib/dispatch/partner-dashboard-queries";
import { isAcceptanceExpired, shouldLockBilling } from "@/lib/dispatch/billing";
import { emitDispatchEvent, type ActionSource } from "@/lib/dispatch/events";
import {
  DISPATCH_STAGES,
  DISQUALIFICATION_REASONS,
  LOST_REASONS,
  STAGE_RANK,
  canMoveStage,
  type DispatchStage,
  type DisqualificationReason,
  type LostReason,
  type Partner,
} from "@/lib/dispatch/types";

/**
 * The two writes a partner makes on a lead: move it along the pipeline, or
 * disqualify it. Shared by the kanban routes (`/api/partners/[uuid]/…`) and
 * the e-mail action links (`/api/partners/action`), so both obey the same
 * stage, billing and reason rules.
 */

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; status: number };

interface DispatchRow {
  id: string;
  partner: string;
  stage: DispatchStage;
  stage_entered_at: string;
  stage_history: Array<{ stage: string; at: string }> | null;
  dispatched_at: string;
  disqualified: boolean | null;
  gift: boolean;
  billable: boolean;
  billable_locked_at: string | null;
  canton: string | null;
  product: string | null;
  submission: { id: string; data: Record<string, unknown> | null } | null;
}

const ROW_FIELDS = [
  "id",
  "partner",
  "stage",
  "stage_entered_at",
  "stage_history",
  "dispatched_at",
  "disqualified",
  "gift",
  "billable",
  "billable_locked_at",
  "canton",
  "product",
  "submission.id",
  "submission.data",
].join(",");

const MAX_NOTE_LENGTH = 2000;

async function fetchOwnedRow(partner: Partner, id: string): Promise<DispatchRow | null> {
  const fetched = await directusFetch<{ data: DispatchRow | null }>(
    `/items/partner_dispatches/${id}?fields=${ROW_FIELDS}`,
    { next: { revalidate: 0 } },
  );
  const row = fetched?.data ?? null;
  return row && row.partner === partner.id ? row : null;
}

/**
 * What the lifecycle webhook may carry: no customer name, e-mail, phone or
 * free-text note — Make posts it to Slack. Postal code and locality locate
 * the lead well enough to recognise it.
 */
function eventContext(partner: Partner, row: DispatchRow, source: ActionSource) {
  const data = row.submission?.data ?? {};
  return {
    source,
    dispatch_id: row.id,
    submission_id: row.submission?.id ?? null,
    partner: { slug: partner.slug, name: partner.name },
    canton: row.canton,
    product: row.product,
    postal_code: typeof data.postalCode === "string" ? data.postalCode : null,
    locality: typeof data.locality === "string" ? data.locality : null,
  };
}

export async function moveDispatchStage(
  partner: Partner,
  id: string,
  body: { stage?: string; lost_reason?: string; lost_note?: string },
  source: ActionSource,
): Promise<ActionResult<{ stage: DispatchStage; billable: boolean }>> {
  const newStage = body.stage as DispatchStage | undefined;
  if (!newStage || !DISPATCH_STAGES.includes(newStage)) {
    return { ok: false, error: "invalid_stage", status: 400 };
  }

  const row = await fetchOwnedRow(partner, id);
  if (!row) return { ok: false, error: "not_found", status: 404 };
  if (row.disqualified) {
    return { ok: false, error: "already_disqualified", status: 409 };
  }
  // Reopening: a closed lead (won/lost) can be moved back into the active
  // pipeline. This is the one sanctioned backward transition — billing stays
  // locked (the lead was already worked) and the lost reason is cleared.
  const isReopen =
    (row.stage === "won" || row.stage === "lost") &&
    STAGE_RANK[newStage] < STAGE_RANK.won;
  if (!isReopen && !canMoveStage(row.stage, newStage)) {
    return { ok: false, error: "backward_stage", status: 409 };
  }

  // Marking a lead Lost requires a reason (sales outcome — kept distinct from
  // a disqualification). 'other' must carry an explanatory note.
  let lostReason: LostReason | null = null;
  let lostNote: string | null = null;
  if (newStage === "lost") {
    const reason = body.lost_reason;
    if (!reason || !LOST_REASONS.includes(reason as LostReason)) {
      return { ok: false, error: "lost_reason_required", status: 400 };
    }
    const note = body.lost_note?.trim() ?? "";
    if (reason === "other" && note.length === 0) {
      return { ok: false, error: "lost_note_required_for_other", status: 400 };
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
        disqualified: Boolean(row.disqualified),
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

  emitDispatchEvent("stage_changed", {
    ...eventContext(partner, row, source),
    from_stage: row.stage,
    to_stage: newStage,
    lost_reason: lostReason,
  });

  return { ok: true, stage: newStage, billable: lockBilling };
}

export async function disqualifyDispatch(
  partner: Partner,
  id: string,
  body: { reason?: string; note?: string },
  source: ActionSource,
): Promise<ActionResult<{ reason: DisqualificationReason }>> {
  const reason = body.reason as DisqualificationReason | undefined;
  if (!reason || !DISQUALIFICATION_REASONS.includes(reason)) {
    return { ok: false, error: "invalid_reason", status: 400 };
  }
  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim().slice(0, MAX_NOTE_LENGTH)
      : null;
  // `other` is the universal escape hatch: it's allowed at every stage but
  // the partner must explain why in the note.
  if (reason === "other" && !note) {
    return { ok: false, error: "note_required_for_other", status: 400 };
  }

  const row = await fetchOwnedRow(partner, id);
  if (!row) return { ok: false, error: "not_found", status: 404 };
  if (row.disqualified) {
    return { ok: false, error: "already_disqualified", status: 409 };
  }
  if (row.billable_locked_at) {
    return { ok: false, error: "billing_locked", status: 409 };
  }

  const [config, crmConfig] = await Promise.all([
    fetchDispatchConfig(),
    fetchPartnerLeadsConfig(),
  ]);

  // Stage-specific reason validation. Missing key in config = all reasons allowed.
  const stageReasons = crmConfig.reasons_by_stage[row.stage];
  if (Array.isArray(stageReasons) && stageReasons.length > 0 && !stageReasons.includes(reason)) {
    return { ok: false, error: "reason_not_allowed_for_stage", status: 400 };
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
    return { ok: false, error: "window_expired", status: 409 };
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

  emitDispatchEvent("disqualified", {
    ...eventContext(partner, row, source),
    stage: row.stage,
    reason,
  });

  return { ok: true, reason };
}
