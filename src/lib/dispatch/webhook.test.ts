import { describe, it, expect } from "vitest";
import { buildQuoteWebhookPayload, type QuoteWebhookParts } from "./webhook";
import type { DispatchResult } from "./types";

const emptyDispatch: DispatchResult = {
  mode: "off",
  canton: "VD",
  isTest: true,
  billableRate: null,
  summary: { resolved: 0, dispatched: 0, skipped: 0, skippedDedup: 0, reasons: [] },
  targets: [],
  dedup: { skippedPartnerSlugs: [], windowDays: 0 },
};

function parts(product: string): QuoteWebhookParts {
  return {
    submission: {
      id: "sub-1",
      locationHost: "easyrecharge.ch",
      locationPath: "/fr/devis",
      submittedAt: "2026-07-25T12:00:00.000Z",
      environment: "development",
      miniQuoteSessionToken: null,
      leadCategory: "standard",
      isRepeat: false,
      product,
      data: { postalCode: "1000", locality: "Lausanne" },
    },
    user: {
      id: "u-1",
      email: "a@b.ch",
      firstName: "A",
      lastName: "B",
      phone: { raw: null, international: null, countryCode: null, countryCallingCode: null },
      language: "fr",
    },
    session: { id: "s-1", token: null, locale: "fr", userAgent: null, ip: null },
    posthog: { distinctId: null, personUrl: null },
    attribution: {},
    dispatch: emptyDispatch,
    trigger: "quote_submission",
  };
}

describe("buildQuoteWebhookPayload product passthrough", () => {
  it("emits the product it was given", () => {
    expect(buildQuoteWebhookPayload(parts("ecp")).submission.product).toBe("ecp");
    expect(buildQuoteWebhookPayload(parts("solar")).submission.product).toBe("solar");
  });
});
