import { NextResponse } from "next/server";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { storage } from "@/lib/directus-storage";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { housingStatus, postalCode, locality, canton, formType, pageId, locale } = body;

    if (!housingStatus || !postalCode) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 },
      );
    }

    const sessionToken = randomUUID();
    const referer = req.headers.get("referer");
    let refererUrl: URL | null = null;
    try { if (referer) refererUrl = new URL(referer); } catch { /* invalid referer */ }

    const phDistinctId = body.posthog?.phDistinctId ?? "anonymous";

    const session = await storage.createOrGetFormSession(sessionToken, {
      session_token: sessionToken,
      form_type: formType || "mini-quote-card",
      locale: locale ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
      location_path: refererUrl?.pathname ?? null,
      location_route: pageId ?? null,
      location_params: refererUrl?.search.slice(1) || null,
      ph_distinct_id: phDistinctId !== "anonymous" ? phDistinctId : null,
      ph_session_id: body.posthog?.phSessionId ?? null,
    });

    await storage.createFormSubmission({
      session: session.id,
      user: null,
      form_type: formType || "mini-quote-card",
      location_route: pageId ?? null,
      location_path: refererUrl?.pathname ?? null,
      location_params: refererUrl?.search.slice(1) || null,
      data: { housingStatus, postalCode, locality, canton },
      status: "success",
    });

    return NextResponse.json({ success: true, sessionToken });
  } catch (error) {
    console.error("[MiniQuote] Submission error:", error);
    serverLog("ERROR", "Mini-quote submission failed", { route: "mini-quote", error: error instanceof Error ? error.message : String(error) });
    try {
      const posthog = getPostHogServer();
      posthog.captureException(error, "anonymous", {
        form_type: "mini-quote",
        context: "form_submission",
      });
      after(() => posthog.flush());
    } catch { /* don't let PostHog break the error response */ }
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
