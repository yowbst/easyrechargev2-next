"use client";

import { useEffect } from "react";
import { getConsent } from "@/lib/consent";

// ChatGPT Ads Measurement Pixel (oaiq), loaded deferred like GoogleAdsTag.
// Config lives in Directus site_settings.global_config.openai_ads — no
// pixel_id there, no pixel loaded.
//
// The SDK measures by default unless told otherwise, so consent is queued
// BEFORE init: measurement only once the cookie banner was accepted.
// `oaiq("consent", false)` also deletes its __oppref / __obref cookies.

export function OpenAIPixel({ pixelId, debug = false }: { pixelId?: string | null; debug?: boolean }) {
  useEffect(() => {
    if (!pixelId || window.oaiq) return;

    // Official queue shim: the SDK replays `arguments` objects.
    const q = function () {
      // eslint-disable-next-line prefer-rest-params
      q.q.push(arguments);
    } as unknown as ((...args: unknown[]) => void) & { q: unknown[] };
    q.q = [];
    window.oaiq = q;

    q("consent", getConsent() === "accepted");
    q("init", { pixelId, debug });

    const onConsent = (e: Event) => {
      window.oaiq?.("consent", (e as CustomEvent).detail === "accepted");
    };
    window.addEventListener("er:consent", onConsent);

    const load = () => {
      const s = document.createElement("script");
      s.src = "https://bzrcdn.openai.com/sdk/oaiq.min.js";
      s.async = true;
      document.head.appendChild(s);
    };
    if ("requestIdleCallback" in window) {
      requestIdleCallback(load, { timeout: 5000 });
    } else {
      setTimeout(load, 3000);
    }

    return () => window.removeEventListener("er:consent", onConsent);
  }, [pixelId, debug]);

  return null;
}
