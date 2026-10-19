import { NextResponse } from "next/server";
import { generateInvoiceDocument } from "@/lib/billing/google-docs";
import { assertAdmin } from "@/lib/admin-auth";
import { errorBody, errorStatus } from "@/lib/billing/admin-guard";

/**
 * Generate (always a NEW) invoice Google Doc from the invoice's current
 * state and return its URL. Admin-token gate: `assertAdmin`.
 *
 *   POST /api/admin/invoices/<id>/document
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assertAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await generateInvoiceDocument(id));
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: errorStatus(e) });
  }
}
