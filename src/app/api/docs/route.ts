import { NextResponse } from "next/server";
import { getOpenApiSpec } from "./openapi";

export async function GET() {
  return NextResponse.json(getOpenApiSpec());
}
