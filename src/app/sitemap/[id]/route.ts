import { NextResponse } from "next/server";
import {
  getCmsEntries,
  getBlogEntries,
  getVehicleEntries,
} from "@/lib/sitemap/registries";

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";

const SEGMENTS: Record<string, () => ReturnType<typeof getCmsEntries>> = {
  "cms.xml": getCmsEntries,
  "blog.xml": getBlogEntries,
  "vehicles.xml": getVehicleEntries,
};

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const fetcher = SEGMENTS[id];

  if (!fetcher) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const entries = await fetcher();

  const urls = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.url)}</loc>`];

      if (entry.alternates?.languages) {
        for (const [lang, href] of Object.entries(entry.alternates.languages)) {
          parts.push(
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}" />`,
          );
        }
      }

      if (entry.lastModified) parts.push(`    <lastmod>${entry.lastModified}</lastmod>`);
      if (entry.changeFrequency) parts.push(`    <changefreq>${entry.changeFrequency}</changefreq>`);
      if (entry.priority != null) parts.push(`    <priority>${entry.priority}</priority>`);

      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

export async function generateStaticParams() {
  return Object.keys(SEGMENTS).map((id) => ({ id }));
}
