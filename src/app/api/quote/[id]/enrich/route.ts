import { NextResponse, after } from "next/server";
import { storage } from "@/lib/directus-storage";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";
import { ENRICH_WINDOW_MS, mergeEnrichAnswers, sanitizeEnrichAnswers, verifyEnrichToken } from "@/lib/quote-enrich";

/**
 * PATCH /api/quote/:id/enrich  { token, answers }
 * Adds the optional charger answers (funnel v2, flag quote-enrich) to a
 * submission just sent. Only the browser that sent it holds the token; only
 * the six known fields with accepted values; only empty answers are filled;
 * only within two hours of the submission.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    if (!verifyEnrichToken(id, body?.token)) return NextResponse.json({ success: false }, { status: 403 });

    const answers = sanitizeEnrichAnswers(body?.answers);
    if (Object.keys(answers).length === 0) return NextResponse.json({ success: true, answered: 0 });

    const found = await storage.getSubmissionById(id);
    const submission = found?.submission;
    if (!submission || submission.form_type !== "quote" || submission.product !== "ecp") {
      return NextResponse.json({ success: false }, { status: 404 });
    }
    if (Date.now() - new Date(submission.date_created).getTime() > ENRICH_WINDOW_MS) {
      return NextResponse.json({ success: false, message: "Too late" }, { status: 409 });
    }

    const { merged, added } = mergeEnrichAnswers(submission.data ?? {}, answers);
    if (added.length > 0) await storage.updateSubmissionData(id, merged);

    try {
      const posthog = getPostHogServer();
      posthog.capture({
        distinctId: (typeof found?.session === "object" && found.session?.ph_distinct_id) || "anonymous",
        event: "server_quote_enriched",
        properties: { submission_id: id, product: "ecp", fields: added, answered: added.length },
      });
      after(() => posthog.flush());
    } catch { /* analytics never blocks */ }

    return NextResponse.json({ success: true, answered: added.length });
  } catch (error) {
    serverLog("ERROR", "Quote enrichment failed", { route: "quote/enrich", id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
