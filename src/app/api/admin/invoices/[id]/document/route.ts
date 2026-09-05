import { NextResponse } from "next/server";
import { generateInvoiceDocument } from "@/lib/billing/google-docs";
import { assertAdmin, errorStatus } from "@/lib/billing/admin-guard";

/**
 * Generate (always a NEW) invoice Google Doc from the invoice's current
 * state and return its URL. Same admin-token gate as /api/admin/billing.
 *
 *   POST /api/admin/invoices/<id>/document
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await generateInvoiceDocument(id));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: errorStatus(e) },
    );
  }
}
