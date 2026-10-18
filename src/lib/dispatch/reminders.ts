import { directusFetch } from "@/lib/directus";
import { getEnvironment } from "@/lib/directus-storage";
import { buildActionUrls } from "./action-token";
import { sendDispatchEvent } from "./events";
import { buildQuoteRef } from "./webhook";
import { leadMessageId } from "./email-thread";
import type { DispatchStage } from "./types";

/**
 * Partner reminders: a lead that sits too long at one stage gets an e-mail
 * asking for an update, with buttons for the next steps. Rules live in
 * `site_settings.global_config.dispatch.reminders`; the cron sends one
 * `reminder_due` event per lead to the "Lead lifecycle" Make scenario and
 * logs it in `partner_dispatch_reminders`, which keeps reruns idempotent.
 *
 * Moving the lead (from the e-mail or the kanban) resets `stage_entered_at`,
 * which ends that stage's reminders by itself.
 */

export interface ReminderRule {
  key: string;
  stage: DispatchStage;
  after_days: number;
}

export interface ReminderConfig {
  enabled: boolean;
  rules: ReminderRule[];
  /**
   * How long a rule stays sendable after it falls due. Past it the lead is
   * left alone: the backlog of old untouched leads is never mass-mailed, and
   * a missed run is caught up only within the window. 3 covers a weekend.
   */
  grace_days: number;
}

export const DEFAULT_GRACE_DAYS = 3;

export const DEFAULT_REMINDER_RULES: ReminderRule[] = [
  { key: "new_d2", stage: "new", after_days: 2 },
  { key: "new_d5", stage: "new", after_days: 5 },
  { key: "contacted_d7", stage: "contacted", after_days: 7 },
  { key: "appointment_d7", stage: "appointment", after_days: 7 },
  { key: "quote_sent_d21", stage: "quote_sent", after_days: 21 },
];

const OPEN_STAGES: DispatchStage[] = ["new", "contacted", "appointment", "quote_sent"];
const DAY_MS = 24 * 60 * 60 * 1000;
/** Upper bound per cron run; the rest goes out on the next run. */
const MAX_PER_RUN = 100;

/** Off unless Directus says `enabled: true` — nothing is e-mailed by default. */
export async function fetchReminderConfig(): Promise<ReminderConfig> {
  type Row = { global_config?: { dispatch?: { reminders?: Partial<ReminderConfig> } } };
  try {
    const res = await directusFetch<{ data: Row | Row[] | null }>(
      `/items/site_settings?fields=global_config`,
      { next: { revalidate: 60 } },
    );
    const raw = res?.data;
    const cfg = (Array.isArray(raw) ? raw[0] : raw)?.global_config?.dispatch?.reminders ?? {};
    const rules = Array.isArray(cfg.rules)
      ? cfg.rules.filter(
          (r): r is ReminderRule =>
            typeof r?.key === "string" &&
            OPEN_STAGES.includes(r.stage) &&
            typeof r.after_days === "number" &&
            r.after_days > 0,
        )
      : DEFAULT_REMINDER_RULES;
    const grace_days =
      typeof cfg.grace_days === "number" && cfg.grace_days > 0 ? cfg.grace_days : DEFAULT_GRACE_DAYS;
    return { enabled: cfg.enabled === true, rules, grace_days };
  } catch {
    return { enabled: false, rules: DEFAULT_REMINDER_RULES, grace_days: DEFAULT_GRACE_DAYS };
  }
}

export interface ReminderCandidate {
  id: string;
  stage: string;
  stage_entered_at: string;
  disqualified: boolean | null;
}

/**
 * Directus returns `dateTime` columns without a zone ("2026-10-18T11:28:35");
 * they are written as UTC, so read them as UTC whatever the server's zone.
 */
export function parseUtc(value: string): number {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`).getTime();
}

/** Identity of one reminder: same rule, same stay at the stage. */
export function reminderKey(dispatchId: string, ruleKey: string, stageEnteredAt: string): string {
  return `${dispatchId}|${ruleKey}|${parseUtc(stageEnteredAt)}`;
}

/**
 * Which leads are owed a reminder now. A rule is due from `after_days` until
 * `after_days + graceDays`. Per lead, only the most advanced due rule counts:
 * if it was already sent, nothing goes out — an earlier rule that was skipped
 * is not caught up, so a lead never gets two e-mails in one run.
 */
export function selectDueReminders<T extends ReminderCandidate>(
  candidates: T[],
  rules: ReminderRule[],
  sent: Set<string>,
  now: number,
  graceDays: number = DEFAULT_GRACE_DAYS,
): Array<{ dispatch: T; rule: ReminderRule; daysInStage: number }> {
  const out: Array<{ dispatch: T; rule: ReminderRule; daysInStage: number }> = [];
  for (const d of candidates) {
    if (d.disqualified === true) continue;
    const entered = parseUtc(d.stage_entered_at);
    if (!Number.isFinite(entered)) continue;
    const elapsed = now - entered;
    const due = rules
      .filter(
        (r) =>
          r.stage === d.stage &&
          elapsed >= r.after_days * DAY_MS &&
          elapsed < (r.after_days + graceDays) * DAY_MS,
      )
      .sort((a, b) => b.after_days - a.after_days)[0];
    if (!due || sent.has(reminderKey(d.id, due.key, d.stage_entered_at))) continue;
    out.push({ dispatch: d, rule: due, daysInStage: Math.floor(elapsed / DAY_MS) });
  }
  return out;
}

interface ReminderRow extends ReminderCandidate {
  stage: DispatchStage;
  dispatched_at: string;
  canton: string | null;
  product: string | null;
  partner: {
    id: string;
    slug: string;
    name: string;
    notification_email: string;
    language: string | null;
    dashboard_token: string | null;
    status: string;
  } | null;
  submission: {
    id: string;
    data: Record<string, unknown> | null;
    user: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      language: string | null;
    } | null;
  } | null;
}

const ROW_FIELDS = [
  "id",
  "stage",
  "stage_entered_at",
  "dispatched_at",
  "disqualified",
  "canton",
  "product",
  "partner.id",
  "partner.slug",
  "partner.name",
  "partner.notification_email",
  "partner.language",
  "partner.dashboard_token",
  "partner.status",
  "submission.id",
  "submission.data",
  "submission.user.first_name",
  "submission.user.last_name",
  "submission.user.email",
  "submission.user.phone",
  "submission.user.language",
].join(",");

async function fetchCandidates(rules: ReminderRule[], graceDays: number, now: number): Promise<ReminderRow[]> {
  const minDays = Math.min(...rules.map((r) => r.after_days));
  const maxDays = Math.max(...rules.map((r) => r.after_days)) + graceDays;
  const params = new URLSearchParams();
  params.set("fields", ROW_FIELDS);
  params.set("filter[status][_eq]", "dispatched");
  params.set("filter[environment][_eq]", getEnvironment());
  params.set("filter[stage][_in]", OPEN_STAGES.join(","));
  params.set("filter[stage_entered_at][_lte]", new Date(now - minDays * DAY_MS).toISOString());
  params.set("filter[stage_entered_at][_gt]", new Date(now - maxDays * DAY_MS).toISOString());
  params.set("sort", "stage_entered_at");
  params.set("limit", "1000");
  const res = await directusFetch<{ data: ReminderRow[] }>(`/items/partner_dispatches?${params}`, {
    next: { revalidate: 0 },
  });
  // `disqualified` is null on most rows, so it is filtered here, not in Directus.
  return (res?.data ?? []).filter((r) => r.disqualified !== true && r.partner?.status === "active");
}

async function fetchSentKeys(dispatchIds: string[]): Promise<Set<string>> {
  const sent = new Set<string>();
  for (let i = 0; i < dispatchIds.length; i += 100) {
    const params = new URLSearchParams();
    params.set("fields", "dispatch,rule_key,stage_entered_at");
    params.set("filter[dispatch][_in]", dispatchIds.slice(i, i + 100).join(","));
    params.set("limit", "-1");
    const res = await directusFetch<{ data: { dispatch: string; rule_key: string; stage_entered_at: string }[] }>(
      `/items/partner_dispatch_reminders?${params}`,
      { next: { revalidate: 0 } },
    );
    for (const r of res?.data ?? []) sent.add(reminderKey(r.dispatch, r.rule_key, r.stage_entered_at));
  }
  return sent;
}

function reminderPayload(row: ReminderRow, rule: ReminderRule, daysInStage: number) {
  const siteUrl = process.env.SITE_URL || "https://easyrecharge.ch";
  const partner = row.partner!;
  const lang = partner.language === "de" ? "de" : "fr";
  const data = row.submission?.data ?? {};
  const user = row.submission?.user ?? null;
  const postalCode = typeof data.postalCode === "string" ? data.postalCode : null;
  const locality = typeof data.locality === "string" ? data.locality : null;
  return {
    rule_key: rule.key,
    dispatch_id: row.id,
    // In-Reply-To / References: files the reminder under the "[ NEW ]" e-mail.
    thread_message_id: leadMessageId(row.id),
    submission_id: row.submission?.id ?? null,
    stage: row.stage,
    days_in_stage: daysInStage,
    partner: {
      slug: partner.slug,
      name: partner.name,
      email: partner.notification_email,
      language: lang,
      crmUrl: partner.dashboard_token ? `${siteUrl}/${lang}/partners/${partner.dashboard_token}/leads` : null,
    },
    // Goes to the partner who already holds this lead — never to Slack.
    lead: {
      ref: buildQuoteRef({
        product: row.product ?? "ecp",
        language: user?.language ?? null,
        lastName: user?.last_name ?? null,
        postalCode,
        locality,
        submittedAt: row.dispatched_at,
      }),
      first_name: user?.first_name ?? null,
      last_name: user?.last_name ?? null,
      email: user?.email ?? null,
      phone: user?.phone ?? null,
      postal_code: postalCode,
      locality,
      canton: row.canton,
      product: row.product,
      dispatched_at: row.dispatched_at,
    },
    actionUrls: buildActionUrls(row.id, row.stage, "reminder", { siteUrl }),
  };
}

export interface ReminderRunItem {
  dispatch_id: string;
  partner_slug: string;
  rule_key: string;
  stage: string;
  days_in_stage: number;
  status?: "sent" | "failed";
}

export async function runReminders(opts: { dryRun: boolean; now?: number }): Promise<{
  enabled: boolean;
  due: number;
  sent: number;
  failed: number;
  error?: string;
  items: ReminderRunItem[];
}> {
  const now = opts.now ?? Date.now();
  const config = await fetchReminderConfig();
  const empty = { enabled: config.enabled, due: 0, sent: 0, failed: 0, items: [] as ReminderRunItem[] };
  // A dry run previews even while reminders are switched off.
  if ((!config.enabled && !opts.dryRun) || config.rules.length === 0) return empty;

  const rows = await fetchCandidates(config.rules, config.grace_days, now);
  if (rows.length === 0) return empty;
  const sentKeys = await fetchSentKeys(rows.map((r) => r.id));
  const due = selectDueReminders(rows, config.rules, sentKeys, now, config.grace_days).slice(0, MAX_PER_RUN);

  const items: ReminderRunItem[] = due.map(({ dispatch, rule, daysInStage }) => ({
    dispatch_id: dispatch.id,
    partner_slug: dispatch.partner!.slug,
    rule_key: rule.key,
    stage: dispatch.stage,
    days_in_stage: daysInStage,
  }));
  if (opts.dryRun) return { ...empty, due: due.length, items };

  let sent = 0;
  let failed = 0;
  for (const [i, { dispatch, rule, daysInStage }] of due.entries()) {
    const result = await sendDispatchEvent("reminder_due", reminderPayload(dispatch, rule, daysInStage));
    // No webhook configured: stop without logging, so nothing is marked sent.
    if (result.error === "no_webhook") {
      return { ...empty, due: due.length, sent, failed, error: "no_webhook", items: items.slice(0, i) };
    }
    const status = result.ok ? "sent" : "failed";
    // Logged even when it failed: a retry could e-mail the partner twice.
    await directusFetch(`/items/partner_dispatch_reminders`, {
      method: "POST",
      body: JSON.stringify({
        dispatch: dispatch.id,
        rule_key: rule.key,
        stage: dispatch.stage,
        stage_entered_at: dispatch.stage_entered_at,
        sent_at: new Date().toISOString(),
        status,
        environment: getEnvironment(),
      }),
      next: { revalidate: 0 },
    });
    items[i].status = status;
    if (result.ok) sent += 1;
    else failed += 1;
  }
  return { ...empty, due: due.length, sent, failed, items };
}
