import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

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
      // WordPress exact redirects
      { source: "/contact", destination: "/fr/contact", permanent: true },
      { source: "/mentions-legales", destination: "/fr/mentions-legales", permanent: true },
      { source: "/politique-de-confidentialite", destination: "/fr/politique-de-confidentialite", permanent: true },
      { source: "/politique-de-cookies-ue", destination: "/fr/politique-de-confidentialite", permanent: true },
      { source: "/obtenir-un-devis", destination: "/fr/demande-devis", permanent: true },
      { source: "/obtenir-un-devis/:path*", destination: "/fr/demande-devis", permanent: true },
      { source: "/guide-recharge", destination: "/fr/blog", permanent: true },
      { source: "/conseils/guide-recharge", destination: "/fr/blog", permanent: true },
      { source: "/guide-recharge/:slug", destination: "/fr/blog/guide-recharge/:slug", permanent: true },
      { source: "/partenaires", destination: "/fr/contact", permanent: true },
      { source: "/partenaires/:path*", destination: "/fr/contact", permanent: true },
      { source: "/espace-pour-partenaires", destination: "/fr/contact", permanent: true },
      { source: "/espace-pour-partenaires/conditions-generales-partenaires", destination: "/fr/mentions-legales", permanent: true },
      { source: "/espace-pour-partenaires/:path*", destination: "/fr/contact", permanent: true },
      // Sitemap aliases — redirect legacy sitemap URLs to sitemap index
      { source: "/sitemap_index.xml", destination: "/sitemap.xml", permanent: true },
      { source: "/sitemap-index.xml", destination: "/sitemap.xml", permanent: true },
      { source: "/wp-sitemap.xml", destination: "/sitemap.xml", permanent: true },
      // Language-prefixed blog redirects
      { source: "/:lang(fr|de|en)/guide-recharge/:slug", destination: "/:lang/blog/guide-recharge/:slug", permanent: true },
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
