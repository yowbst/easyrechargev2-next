import { createHmac, timingSafeEqual } from "node:crypto";
import { STAGE_RANK, type DispatchStage } from "./types";

/**
 * Signed links that let a partner act on a lead from an e-mail, without
 * logging in. The token names one dispatch and one action; it is the only
 * credential, like the dashboard token. Opening the link (GET) never writes —
 * mail scanners open links before people do — the confirmation page POSTs.
 */

export type DispatchAction = DispatchStage | "disqualify";

/** Where the buttons appear. Reminders never offer to disqualify. */
export type ActionContext = "new" | "reminder";

export interface ActionPayload {
  /** partner_dispatches id */
  d: string;
  a: DispatchAction;
  /** Expiry, epoch milliseconds. */
  exp: number;
  /** Which e-mail carried the link — for adoption analytics only. */
  c?: ActionContext;
}

export const ACTION_TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000;

const ACTIONS: readonly DispatchAction[] = [
  "new", "contacted", "appointment", "quote_sent", "won", "lost", "disqualify",
];

// A dedicated secret when set; otherwise an existing server-only one. No secret, no buttons.
const secret = () =>
  process.env.DISPATCH_ACTION_SECRET || process.env.MCP_JWT_SECRET || process.env.CRON_SECRET || null;

function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(`dispatch-action:${body}`).digest("base64url");
}

export function signDispatchAction(payload: ActionPayload, key = secret()): string | null {
  if (!key) return null;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export type VerifiedAction =
  | { status: "valid"; payload: ActionPayload }
  | { status: "expired"; payload: ActionPayload }
  | { status: "invalid" };

export function verifyDispatchAction(token: unknown, now = Date.now(), key = secret()): VerifiedAction {
  if (typeof token !== "string" || !key) return { status: "invalid" };
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { status: "invalid" };

  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { status: "invalid" };
  }

  let payload: ActionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { status: "invalid" };
  }
  if (
    typeof payload?.d !== "string" ||
    !ACTIONS.includes(payload.a) ||
    typeof payload.exp !== "number"
  ) {
    return { status: "invalid" };
  }
  return payload.exp < now ? { status: "expired", payload } : { status: "valid", payload };
}

/**
 * The next steps worth a button, given where the lead sits. Disqualifying is
 * offered only on the new-lead e-mail (to drop a lead the partner already
 * knows); a reminder never nudges towards it inside the acceptance window.
 */
export function actionsFor(stage: DispatchStage, context: ActionContext): DispatchAction[] {
  switch (stage) {
    case "new":
      return context === "new" ? ["contacted", "disqualify"] : ["contacted", "appointment"];
    case "contacted":
      return ["appointment", "quote_sent", "lost"];
    case "appointment":
      return ["quote_sent", "lost"];
    case "quote_sent":
      return ["won", "lost"];
    default:
      return [];
  }
}

/**
 * `{ contacted: "https://…/partners/action/<token>", … }` for the e-mail.
 * Null when no secret is configured — the e-mail then shows no buttons.
 */
export function buildActionUrls(
  dispatchId: string,
  stage: DispatchStage,
  context: ActionContext,
  opts: { siteUrl?: string; now?: number; key?: string | null } = {},
): Partial<Record<DispatchAction, string>> | null {
  const siteUrl = opts.siteUrl ?? (process.env.SITE_URL || "https://easyrecharge.ch");
  const exp = (opts.now ?? Date.now()) + ACTION_TOKEN_TTL_MS;
  const key = opts.key === undefined ? secret() : opts.key;
  const urls: Partial<Record<DispatchAction, string>> = {};
  for (const a of actionsFor(stage, context)) {
    const token = signDispatchAction({ d: dispatchId, a, exp, c: context }, key);
    if (!token) return null;
    urls[a] = `${siteUrl}/partners/action/${token}`;
  }
  return urls;
}

/**
 * Why an action can no longer apply to the lead as it stands, or null. Lets a
 * second click (or a link opened days later) say "already done" instead of
 * rewriting the stage history. Moving backwards stays a kanban-only gesture.
 */
export type ActionBlocker = "already_disqualified" | "already_done" | "billing_locked";

export function actionBlocker(
  row: { stage: string; disqualified: boolean | null; billable_locked_at: string | null },
  action: DispatchAction,
): ActionBlocker | null {
  if (row.disqualified) return "already_disqualified";
  if (action === "disqualify") return row.billable_locked_at ? "billing_locked" : null;
  const current = STAGE_RANK[row.stage as DispatchStage];
  if (current === undefined) return null;
  return current >= STAGE_RANK[action] ? "already_done" : null;
}
