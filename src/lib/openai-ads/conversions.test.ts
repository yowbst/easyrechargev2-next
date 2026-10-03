import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/posthog-server", () => ({ serverLog: vi.fn() }));

import { buildOpenAILeadEvent, sendOpenAILeadConversion } from "./conversions";
import type { QuoteWebhookPayload } from "@/lib/dispatch/webhook";

const NOW = Date.parse("2026-10-03T12:00:00.000Z");

function payload(over: {
  environment?: string;
  isTest?: boolean;
  dispatched?: number;
  attribution?: Record<string, unknown>;
  submittedAt?: string;
} = {}): QuoteWebhookPayload {
  return {
    submission: {
      id: "sub-1",
      locationHost: "easyrecharge.ch",
      locationPath: "/fr/devis-batterie-solaire",
      submittedAt: over.submittedAt ?? "2026-10-03T11:59:00.000Z",
      environment: over.environment ?? "production",
      product: "battery",
    },
    session: { ip: "203.0.113.1", userAgent: "Mozilla/5.0" },
    attribution: over.attribution ?? { oppref: "oppref_abc", obref: "ob-1" },
    dispatch: { isTest: over.isTest ?? false, summary: { dispatched: over.dispatched ?? 1 } },
  } as unknown as QuoteWebhookPayload;
}

describe("buildOpenAILeadEvent", () => {
  it("builds a deduplicable lead_created event for a real dispatched lead", () => {
    expect(buildOpenAILeadEvent(payload(), NOW)).toEqual({
      id: "sub-1",
      type: "lead_created",
      timestamp_ms: Date.parse("2026-10-03T11:59:00.000Z"),
      oppref: "oppref_abc",
      source_url: "https://easyrecharge.ch/fr/devis-batterie-solaire",
      action_source: "web",
      user: { obref: "ob-1", ip_address: "203.0.113.1", user_agent: "Mozilla/5.0" },
      data: { type: "customer_action" },
    });
  });

  it("skips what the Google upload skips: non-production, tests, undispatched leads", () => {
    expect(buildOpenAILeadEvent(payload({ environment: "preview" }), NOW)).toBeNull();
    expect(buildOpenAILeadEvent(payload({ isTest: true }), NOW)).toBeNull();
    expect(buildOpenAILeadEvent(payload({ dispatched: 0 }), NOW)).toBeNull();
  });

  it("skips leads without a ChatGPT click or pixel reference", () => {
    expect(buildOpenAILeadEvent(payload({ attribution: { gclid: "g" } }), NOW)).toBeNull();
    expect(buildOpenAILeadEvent(payload({ attribution: { obref: "ob-1" } }), NOW)).not.toBeNull();
  });

  it("skips events older than the API's 7-day window", () => {
    expect(buildOpenAILeadEvent(payload({ submittedAt: "2026-09-25T12:00:00.000Z" }), NOW)).toBeNull();
  });
});

describe("sendOpenAILeadConversion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is a no-op without credentials", async () => {
    vi.stubEnv("OPENAI_ADS_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendOpenAILeadConversion(payload())).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the event with the pixel id and bearer key", async () => {
    vi.stubEnv("OPENAI_ADS_API_KEY", "key");
    vi.stubEnv("OPENAI_ADS_PIXEL_ID", "pix");
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendOpenAILeadConversion(payload())).toEqual({ sent: true, status: 200 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bzr.openai.com/v1/events?pid=pix");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key");
    const body = JSON.parse(String(init.body));
    expect(body.validate_only).toBe(false);
    expect(body.events[0].id).toBe("sub-1");
    vi.useRealTimers();
  });
});
