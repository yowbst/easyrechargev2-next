const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";
const SEGMENTS = ["cms", "blog", "vehicles"];

export function GET() {
  const entries = SEGMENTS.map(
    (id) =>
      `  <sitemap>\n    <loc>${SITE_URL}/sitemap/${id}.xml</loc>\n  </sitemap>`,
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
