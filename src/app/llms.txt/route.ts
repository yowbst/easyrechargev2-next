import { buildLlmsTxt } from "@/lib/seo/llms";
import { loadLlmsInput } from "@/lib/seo/llms-data";

export const revalidate = 3600;

// Curated site map for AI crawlers (https://llmstxt.org), served at /llms.txt.
// src/proxy.ts lets dotted paths through, so this is not caught by [lang].
export async function GET() {
  const body = buildLlmsTxt(await loadLlmsInput());
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
