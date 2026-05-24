import { CANTON_CODES, getCantonCode } from "@/shared/swiss-cantons";
import { getEnvironment } from "@/lib/directus-storage";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";
import { after } from "next/server";
import {
  fetchPartnerAreasForCanton,
  countDispatchesThisMonth,
  recordDispatch,
  fetchDispatchConfig,
  buildPartnerLeadPrices,
  findRecentDispatchesByEmail,
} from "./queries";
import { resolveDispatchTargets, targetToArea } from "./resolver";
import type {
  DispatchContext,
  DispatchMode,
  DispatchResult,
  Environment,
  Language,
  LeadCategory,
} from "./types";

export type { DispatchResult } from "./types";

/**
 * Normalize a raw canton string (either a 2-letter code or a localized name)
 * to a 2-letter code. Returns null when the input can't be resolved.
 */
export function normalizeCanton(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if ((CANTON_CODES as readonly string[]).includes(upper)) return upper;
  return getCantonCode(raw.trim()) ?? null;
}

/**
 * Match Make scenario module 46's isTest recipe:
 *   isTest = matchesTestPattern(email) || environment !== 'production'
 * Patterns come from site_settings.global_config.dispatch.test_email_patterns.
 */
export function computeIsTest(
  email: string | null | undefined,
  environment: Environment,
  testEmailPatterns: string[],
): boolean {
  if (environment !== "production") return true;
  if (!email) return false;
  const lower = email.toLowerCase();
  return testEmailPatterns.some((p) => p && lower.includes(p.toLowerCase()));
}

function getDispatchMode(): DispatchMode {
  const raw = process.env.DISPATCH_MODE?.toLowerCase();
  if (raw === "shadow") return "shadow";
  if (raw === "live") return "live";
  return "off";
}

interface RunDispatchInput {
  submissionId: string;
  rawCanton: string | null | undefined;
  email: string | null | undefined;
  locale: Language;
  leadCategory: LeadCategory;
  /** Product key for pricing + future quote funnels. Defaults to "ecp". */
  product?: string;
}

/**
 * Main entrypoint called from the quote route. Never throws — failures are
 * logged and an empty result is returned so the user submission flow is
 * unaffected by dispatch issues.
 */
export async function runDispatch(input: RunDispatchInput): Promise<DispatchResult> {
  const mode = getDispatchMode();
  const environment = getEnvironment();
  const canton = normalizeCanton(input.rawCanton) ?? "";

  const baseResult: DispatchResult = {
    mode,
    canton,
    isTest: environment !== "production",
    billableRate: null,
    summary: {
      resolved: 0,
      dispatched: 0,
      skipped: 0,
      skippedDedup: 0,
      reasons: [],
    },
    dedup: { skippedPartnerSlugs: [], windowDays: 0 },
    targets: [],
  };

  // off → emit a payload block so Make can branch, but do no work.
  if (mode === "off") return baseResult;

  // No canton → silent no-op (matches today's behavior for unknown cantons).
  if (!canton) {
    baseResult.summary.reasons.push("unknown_canton");
    baseResult.summary.skipped = 1;
    return baseResult;
  }

  try {
    const config = await fetchDispatchConfig();
    const isTest = computeIsTest(input.email, environment, config.test_email_patterns);
    baseResult.isTest = isTest;

    const areas = await fetchPartnerAreasForCanton(canton, environment);
    if (areas.length === 0) {
      baseResult.summary.reasons.push("no_partner_for_canton");
      fireDispatchEvents(
        {
          submissionId: input.submissionId,
          canton,
          locale: input.locale,
          environment,
          isTest,
        },
        mode,
        [],
        baseResult.summary.reasons,
      );
      return baseResult;
    }

    const partnerIds = areas.map((a) => a.partner.id);
    const product = input.product ?? "ecp";

    // Prices live in partner.pricing_policy.settings.prices[product][category],
    // pulled via PARTNER_AREA_FIELDS — pure function, no extra fetch.
    const partnerPrices = buildPartnerLeadPrices(areas, product);

    const [counts, dedupPartnerIds] = await Promise.all([
      countDispatchesThisMonth(partnerIds, environment),
      input.email
        ? findRecentDispatchesByEmail(
            input.email,
            partnerIds,
            environment,
            config.billing.dedup_window_days,
          )
        : Promise.resolve(new Set<string>()),
    ]);

    const resolved = resolveDispatchTargets({
      areas,
      quotaUsed: counts,
      maxSharedTargets: config.max_shared_targets,
      leadCategory: input.leadCategory,
      partnerPrices,
      dedupPartnerIds,
    });
    baseResult.summary.resolved = resolved.targets.length;
    baseResult.summary.reasons = resolved.reasons;

    const ctx: DispatchContext = {
      submissionId: input.submissionId,
      canton,
      locale: input.locale,
      environment,
      isTest,
    };

    // Record ledger rows. In shadow mode the status is still `dispatched` so
    // quota counting works the same in shadow and live. In test mode we use
    // `skipped_test` and Make's webhook is not given any targets.
    for (const target of resolved.targets) {
      const area = targetToArea(target, areas);
      if (!area) continue;
      try {
        await recordDispatch({
          submission: ctx.submissionId,
          partner: area.partner.id,
          canton,
          mode_used: target.mode,
          status: isTest ? "skipped_test" : "dispatched",
          environment,
          product,
          stage: "new",
          price_chf: target.priceChf,
          lead_category: target.leadCategory,
          gift: target.gift,
        });
        if (isTest) baseResult.summary.skipped += 1;
        else baseResult.summary.dispatched += 1;
      } catch (err) {
        console.error("[dispatch] recordDispatch failed", err);
        serverLog("ERROR", "recordDispatch failed", {
          partner_slug: target.partnerSlug,
          submission_id: ctx.submissionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // One `skipped_dedup` ledger row per partner who would have been picked
    // but already received a recent dispatch for this email. Surface the
    // affected partner slugs + the configured window on the result so the
    // webhook downstream can flag the submission as a duplicate.
    baseResult.dedup.windowDays = config.billing.dedup_window_days;
    for (const sk of resolved.skippedDedup) {
      baseResult.dedup.skippedPartnerSlugs.push(sk.partnerSlug);
      try {
        await recordDispatch({
          submission: ctx.submissionId,
          partner: sk.partnerId,
          canton,
          mode_used: sk.mode,
          status: "skipped_dedup",
          environment,
          product,
        });
        baseResult.summary.skipped += 1;
        baseResult.summary.skippedDedup += 1;
      } catch (err) {
        console.error("[dispatch] recordDispatch (dedup) failed", err);
      }
    }

    // PostHog telemetry, fire-and-forget.
    fireDispatchEvents(ctx, mode, resolved.targets, resolved.reasons);

    // Build the payload-facing result.
    if (mode === "shadow" || isTest) {
      // Shadow + test never expose targets to Make; legacy path runs.
      return {
        ...baseResult,
        targets: [],
        billableRate: null,
      };
    }

    // mode === "live", !isTest: expose targets and billableRate to Make.
    const billableRate =
      resolved.targets.length > 0
        ? Math.max(...resolved.targets.map((t) => t.billableRate))
        : null;

    return {
      ...baseResult,
      targets: resolved.targets,
      billableRate,
    };
  } catch (err) {
    console.error("[dispatch] runDispatch failed", err);
    serverLog("ERROR", "runDispatch failed", {
      submission_id: input.submissionId,
      canton,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      const ph = getPostHogServer();
      ph.capture({
        distinctId: input.submissionId,
        event: "dispatch_failed",
        properties: {
          submission_id: input.submissionId,
          canton,
          mode,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      after(() => ph.flush());
    } catch {
      /* don't let telemetry break dispatch failures */
    }
    return baseResult;
  }
}

function fireDispatchEvents(
  ctx: DispatchContext,
  mode: DispatchMode,
  targets: { partnerSlug: string; mode: string }[],
  reasons: string[],
) {
  try {
    const ph = getPostHogServer();
    ph.capture({
      distinctId: ctx.submissionId,
      event: "dispatch_resolved",
      properties: {
        submission_id: ctx.submissionId,
        canton: ctx.canton,
        environment: ctx.environment,
        mode,
        is_test: ctx.isTest,
        target_count: targets.length,
        reasons,
      },
    });
    for (const t of targets) {
      ph.capture({
        distinctId: ctx.submissionId,
        event: ctx.isTest ? "dispatch_skipped_test" : "dispatch_sent",
        properties: {
          submission_id: ctx.submissionId,
          canton: ctx.canton,
          partner_slug: t.partnerSlug,
          mode_used: t.mode,
          environment: ctx.environment,
        },
      });
    }
    for (const reason of reasons) {
      if (reason === "exclusive_over_quota" || reason === "no_partner_for_canton") {
        ph.capture({
          distinctId: ctx.submissionId,
          event: `dispatch_${reason}`,
          properties: {
            submission_id: ctx.submissionId,
            canton: ctx.canton,
            environment: ctx.environment,
          },
        });
      }
    }
    after(() => ph.flush());
  } catch {
    /* telemetry never breaks the request */
  }
}
