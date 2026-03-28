import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { storage } from "@/lib/directus-storage";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { housingStatus, postalCode, locality, canton, formType, locale } = body;

    if (!housingStatus || !postalCode) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 },
      );
    }

    const sessionToken = randomUUID();
    const referer = req.headers.get("referer");
    const refererUrl = referer ? new URL(referer) : null;

    const session = await storage.createOrGetFormSession(sessionToken, {
      session_token: sessionToken,
      form_type: formType || "mini-quote-card",
      locale: locale ?? req.headers.get("accept-language")?.split(",")[0] ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
      location_path: refererUrl?.pathname ?? null,
      location_route: formType || "mini-quote-card",
      location_params: refererUrl?.search.slice(1) || null,
      ph_distinct_id: body.posthog?.phDistinctId ?? null,
      ph_session_id: body.posthog?.phSessionId ?? null,
    });

    await storage.createFormSubmission({
      session: session.id,
      user: null,
      form_type: formType || "mini-quote-card",
      location_route: formType || "mini-quote-card",
      location_path: refererUrl?.pathname ?? null,
      location_params: refererUrl?.search.slice(1) || null,
      data: { housingStatus, postalCode, locality, canton },
      status: "success",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MiniQuote] Submission error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
