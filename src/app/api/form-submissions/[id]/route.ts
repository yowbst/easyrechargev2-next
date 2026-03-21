import { NextResponse } from "next/server";
import { storage } from "@/lib/directus-storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await storage.getSubmissionById(id);

    if (!result) {
      return NextResponse.json({ success: false }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[FormSubmissions] GET error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
