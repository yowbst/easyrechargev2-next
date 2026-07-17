import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// ANALYZE=true npm run build — note the analyzer only instruments webpack
// builds; with the default Turbopack build it is a no-op.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  reactCompiler: true,
  crossOrigin: "anonymous",

  experimental: {
    // Inline critical CSS to reduce render-blocking requests
    optimizeCss: true,
    optimizePackageImports: ["lucide-react", "@vis.gl/react-google-maps"],
  },

  images: {
    qualities: [60, 65, 75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "easyrechargev2-directus-production.up.railway.app",
      },
    ],
  },

  async rewrites() {
    return [
      // Partner Leads view lives outside the [lang] layout (no public
      // Header/Footer) but exposes a language-prefixed URL. The actual page
      // is at src/app/partners/[uuid]/leads/page.tsx; we just pass lang as a
      // query.
      {
        source: "/:lang(fr|de)/partners/:path*",
        destination: "/partners/:path*?lang=:lang",
      },
    ];
  },

  async redirects() {
    return [
      // Root → /fr
      { source: "/", destination: "/fr", permanent: true },
      // WordPress exact redirects
      { source: "/contact", destination: "/fr/contact", permanent: true },
      { source: "/mentions-legales", destination: "/fr/mentions-legales", permanent: true },
      { source: "/politique-de-confidentialite", destination: "/fr/politique-de-confidentialite", permanent: true },
      { source: "/politique-de-cookies-ue", destination: "/fr/politique-de-confidentialite", permanent: true },
      { source: "/obtenir-un-devis", destination: "/fr/demande-devis", permanent: true },
      { source: "/obtenir-un-devis/:path*", destination: "/fr/demande-devis", permanent: true },
      { source: "/blog", destination: "/fr/blog", permanent: true },
      { source: "/demande-devis", destination: "/fr/demande-devis", permanent: true },
      { source: "/guide-recharge", destination: "/fr/blog", permanent: true },
      { source: "/conseils/guide-recharge", destination: "/fr/blog", permanent: true },
      { source: "/guide-recharge/:slug", destination: "/fr/blog/guide-recharge/:slug", permanent: true },
      { source: "/partenaires", destination: "/fr/contact", permanent: true },
      { source: "/partenaires/:path*", destination: "/fr/contact", permanent: true },
      { source: "/espace-pour-partenaires", destination: "/fr/contact", permanent: true },
      { source: "/espace-pour-partenaires/conditions-generales-partenaires", destination: "/fr/mentions-legales", permanent: true },
      { source: "/espace-pour-partenaires/:path*", destination: "/fr/contact", permanent: true },
      // Sitemap aliases — legacy URLs redirect to the canonical index.
      // /sitemap.xml itself is served directly (200) by
      // src/app/sitemap.xml/route.ts — no redirect.
      { source: "/sitemap_index.xml", destination: "/sitemap.xml", permanent: false },
      { source: "/sitemap-index.xml", destination: "/sitemap.xml", permanent: false },
      { source: "/wp-sitemap.xml", destination: "/sitemap.xml", permanent: false },
      // WordPress infrastructure → gone (directories & API)
      { source: "/wp-admin/:path*", destination: "/api/gone", permanent: false },
      { source: "/wp-content/:path*", destination: "/api/gone", permanent: false },
      { source: "/wp-includes/:path*", destination: "/api/gone", permanent: false },
      { source: "/wp-json/:path*", destination: "/api/gone", permanent: false },
      { source: "/feed/:path*", destination: "/api/gone", permanent: false },
      { source: "/feed", destination: "/api/gone", permanent: false },
      { source: "/xmlrpc.php", destination: "/api/gone", permanent: false },
      // WordPress PHP files (wp-login.php, wp-cron.php, wp-signup.php, etc.) → home
      { source: "/wp-:slug.php", destination: "/fr", permanent: true },
      // Language-prefixed blog redirects
      { source: "/:lang(fr|de|en)/guide-recharge/:slug", destination: "/:lang/blog/guide-recharge/:slug", permanent: true },
      // Blog post slug redirects (renamed articles)
      { source: "/:lang(fr|de)/blog/:cat/quelles-sont-les-demarches-pour-installer-une-borne-de-recharge-en-tant-que-proprietaire", destination: "/:lang/blog/:cat/quelles-sont-les-demarches-administratives-en-tant-que-co-proprietaire-en-ppe-pour-installer-une-borne-de-recharge", permanent: true },
      { source: "/:lang(fr|de)/blog/:cat/quelles-sont-les-demarches-en-tant-que-locataire-pour-installer-une-borne-de-recharge", destination: "/:lang/blog/:cat/quelles-sont-les-demarches-administratives-en-tant-que-co-proprietaire-en-ppe-pour-installer-une-borne-de-recharge", permanent: true },
      { source: "/:lang(fr|de)/blog/:cat/en-installant-une-borne-de-recharge-en-tant-que-co-proprietaire-qui-prend-en-charge-les-couts", destination: "/:lang/blog/:cat/en-installant-une-borne-en-tant-que-locataire-qui-prend-en-charge-les-couts", permanent: true },
      // Legacy quote URL alias
      { source: "/fr/obtenir-un-devis", destination: "/fr/demande-devis", permanent: true },
      // English not yet supported — redirect to French equivalent
      { source: "/en", destination: "/fr", permanent: false },
      { source: "/en/:path*", destination: "/fr/:path*", permanent: false },
      // Legacy partner /crm path → /leads (route was renamed from CRM to Leads).
      { source: "/:lang(fr|de)/partners/:uuid/crm", destination: "/:lang/partners/:uuid/leads", permanent: true },
      { source: "/partners/:uuid/crm", destination: "/fr/partners/:uuid/leads", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Keep non-production hosts out of search indexes. The `has` host
      // conditions match ONLY staging.easyrecharge.ch and *.vercel.app
      // (preview deploys) — the production apex easyrecharge.ch matches
      // neither pattern, so it never receives this header and stays
      // indexable. Guarded by src/lib/noindex-hosts.test.ts.
      {
        source: "/:path*",
        has: [{ type: "host", value: "staging.easyrecharge.ch" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?<vercelHost>.+\\.vercel\\.app)" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      // Long cache for static assets (fonts, images, GeoJSON)
      {
        source: "/:path*.(geojson|woff2|woff|ico|webp|png|jpg|svg)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // CMS asset proxy — cache for 1 day (content may change)
      {
        source: "/api/cms/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
