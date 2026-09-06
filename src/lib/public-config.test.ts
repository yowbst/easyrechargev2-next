import { describe, expect, it } from "vitest";
import { pickPublicQuoteConfig } from "./public-config";

/**
 * Regression guard for a real leak: the whole `global_config` was passed to the
 * quote form (a client component), so the Make webhook URLs that accept quote
 * and contact submissions were readable in the served HTML of
 * /fr/demande-devis. Anyone could post fabricated quotes into the scenario.
 */

const REAL_SHAPE = {
  slas: { first_contact: { value: 72, unit: "hours" } },
  stats: { requests: 1500, installations: 550 },
  trustpilot: { score: 4.8 },
  google_ads: { tag_id: "AW-360470746", account_id: "864-530-6017" },
  webhooks: {
    quote: "https://hook.eu2.make.com/SECRET-QUOTE",
    contact: "https://hook.eu2.make.com/SECRET-CONTACT",
  },
  dispatch: {
    test_email_patterns: ["yoan.basset"],
    billing: { acceptance_window_days: 15 },
  },
};

describe("pickPublicQuoteConfig", () => {
  it("keeps the four presentation keys the form actually renders", () => {
    const out = pickPublicQuoteConfig(REAL_SHAPE);
    expect(out.slas).toEqual(REAL_SHAPE.slas);
    expect(out.stats).toEqual(REAL_SHAPE.stats);
    expect(out.trustpilot).toEqual(REAL_SHAPE.trustpilot);
    expect(out.google_ads).toEqual(REAL_SHAPE.google_ads);
  });

  it("drops the webhook URLs and the dispatch config", () => {
    const out = pickPublicQuoteConfig(REAL_SHAPE) as Record<string, unknown>;
    expect(out.webhooks).toBeUndefined();
    expect(out.dispatch).toBeUndefined();
    expect(Object.keys(out).sort()).toEqual(["google_ads", "slas", "stats", "trustpilot"]);
  });

  it("leaks nothing when serialised, which is what reaches the browser", () => {
    const serialised = JSON.stringify(pickPublicQuoteConfig(REAL_SHAPE));
    expect(serialised).not.toContain("hook.eu2.make.com");
    expect(serialised).not.toContain("SECRET-QUOTE");
    expect(serialised).not.toContain("test_email_patterns");
    expect(serialised).not.toContain("acceptance_window_days");
  });

  it("is allow-list based, so a newly added secret cannot leak by default", () => {
    const out = pickPublicQuoteConfig({
      ...REAL_SHAPE,
      company: { iban: "CH00 0000 0000 0000 0" },
      api_keys: { anything: "secret" },
    }) as Record<string, unknown>;
    expect(out.company).toBeUndefined();
    expect(out.api_keys).toBeUndefined();
  });

  it("tolerates a missing or empty config", () => {
    expect(pickPublicQuoteConfig(null)).toEqual({});
    expect(pickPublicQuoteConfig(undefined)).toEqual({});
    expect(pickPublicQuoteConfig({})).toEqual({});
  });
});
