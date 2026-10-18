import { after, NextResponse } from "next/server";
import { findPartnerById } from "@/lib/partner-auth";
import { fetchDispatchCardById } from "@/lib/dispatch/partner-dashboard-queries";
import { verifyDispatchAction } from "@/lib/dispatch/action-token";
import { act } from "@/lib/dispatch/lifecycle";
import { getPostHogServer } from "@/lib/posthog-server";

interface Body {
  token?: string;
  /** Lost or disqualification reason, when the action needs one. */
  reason?: string;
  note?: string;
}

/**
 * The write behind an e-mail action link. The link itself (GET) only renders
 * `/partners/action/[token]`; this is what its Confirm button calls. The
 * token is re-verified here — it is the only credential.
 */
export async function POST(req: Request) {
  const body: Body = await req.json().catch(() => ({}));
  const verified = verifyDispatchAction(body.token);
  if (verified.status === "invalid") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (verified.status === "expired") {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  const { d: dispatchId, a: action, c: context } = verified.payload;

  const row = await fetchDispatchCardById(dispatchId);
  const partner = row ? await findPartnerById(row.partner) : null;
  if (!row || !partner) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const track = (result: string) => {
    const ph = getPostHogServer();
    ph.capture({
      distinctId: `partner:${partner.slug}`,
      event: "partner_email_action",
      properties: { action, result, partner_slug: partner.slug, source: context ?? null, from_stage: row.stage },
    });
    after(() => ph.flush());
  };

  // A repeated or overtaken click comes back as `already_done` from the rules.
  const result = await act(
    dispatchId,
    { kind: "partner", partnerId: partner.id, source: "email" },
    action === "disqualify"
      ? { type: "disqualify", reason: body.reason ?? "", note: body.note }
      : { type: "move", stage: action, lostReason: body.reason, lostNote: body.note },
  );

  track(result.ok ? "done" : result.error);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
