// Client-side helpers for the ChatGPT Ads Measurement Pixel (oaiq). The
// pixel itself is loaded by OpenAIPixel (consent-gated, idle-loaded); its
// Pixel ID comes from Directus site_settings.global_config.openai_ads.
//
// Events:
//   - lead_created             quote submitted, charger and battery ("ECP" /
//                              "BATTERY Quote Form Submitted"); the products
//                              differ by page URL. event_id = submission id,
//                              shared with the server-side Conversions API
//                              event (src/lib/openai-ads/conversions.ts).
//   - page_viewed              quote started ("ECP" / "BATTERY Quote Form
//                              Started"): first forward step of a funnel,
//                              content id `<product>-quote-started`.

import { DEFAULT_PRODUCT, type Product } from "@/lib/products";

type Oaiq = ((...args: unknown[]) => void) & { q?: unknown[] };

declare global {
  interface Window {
    oaiq?: Oaiq;
  }
}

/**
 * Queue a measure call once the oaiq shim exists. Child effects run before
 * the layout-level OpenAIPixel effect, and a call queued before its
 * consent/init would be measured out of order — so wait for the shim
 * (it is created together with consent + init). Gives up silently after
 * ~5s, i.e. when no Pixel ID is configured.
 */
function measure(event: string, data: Record<string, unknown>, options?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  let attempts = 0;
  const run = () => {
    if (window.oaiq) {
      window.oaiq("measure", event, data, options);
    } else if (attempts++ < 50) {
      setTimeout(run, 100);
    }
  };
  run();
}

const QUOTE_STARTED_NAMES: Record<Product, string> = {
  ecp: "ECP Quote Form Started",
  battery: "BATTERY Quote Form Started",
};

export function measureQuoteStarted(product: Product = DEFAULT_PRODUCT) {
  measure("page_viewed", {
    type: "contents",
    contents: [{ id: `${product}-quote-started`, name: QUOTE_STARTED_NAMES[product], content_type: "page" }],
  });
}

export function measureQuoteSubmitted(submissionId: string | undefined) {
  measure("lead_created", { type: "customer_action" }, submissionId ? { event_id: submissionId } : undefined);
}
