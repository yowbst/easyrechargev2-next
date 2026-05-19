import { NextResponse, after } from "next/server";
import { storage } from "@/lib/directus-storage";
import { getPostHogServer, serverLog } from "@/lib/posthog-server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await storage.getSubmissionById(id);

    if (!result) {
      serverLog("WARNING", "Form submission not found", { route: "form-submissions", id });
      return NextResponse.json({ success: false }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[FormSubmissions] GET error:", error);
    serverLog("ERROR", "Form submission fetch failed", { route: "form-submissions", error: error instanceof Error ? error.message : String(error) });
    try {
      const posthog = getPostHogServer();
      posthog.captureException(error, "anonymous", { context: "form_submission_fetch" });
      after(() => posthog.flush());
    } catch { /* don't let PostHog break the error response */ }
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
