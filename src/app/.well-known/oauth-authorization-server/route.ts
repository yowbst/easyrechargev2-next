import { NextResponse } from "next/server";
import { requestBaseUrl } from "@/lib/mcp/auth";
import { authorizationServerMetadata } from "@/lib/mcp/metadata";

export async function GET(req: Request) {
  return NextResponse.json(authorizationServerMetadata(requestBaseUrl(req)));
}
