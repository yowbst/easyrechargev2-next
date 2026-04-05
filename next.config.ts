import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  experimental: {
    // Inline critical CSS to reduce render-blocking requests
    optimizeCss: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cms.easyrecharge.ch",
      },
    ],
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
      // Sitemap aliases — redirect legacy URLs to individual sitemaps
      { source: "/sitemap.xml", destination: "/api/sitemap-index", permanent: false },
      { source: "/sitemap_index.xml", destination: "/api/sitemap-index", permanent: false },
      { source: "/sitemap-index.xml", destination: "/api/sitemap-index", permanent: false },
      { source: "/wp-sitemap.xml", destination: "/api/sitemap-index", permanent: false },
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
      // English not yet supported — redirect to French equivalent
      { source: "/en", destination: "/fr", permanent: false },
      { source: "/en/:path*", destination: "/fr/:path*", permanent: false },
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
    ];
  },
};

export default nextConfig;
