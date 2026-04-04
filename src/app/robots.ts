import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";
const isProduction = SITE_URL === "https://easyrecharge.ch" || SITE_URL === "https://www.easyrecharge.ch";

export default function robots(): MetadataRoute.Robots {
  if (!isProduction) {
    return {
      rules: {
        userAgent: "*",
        disallow: ["/"],
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: [
      `${SITE_URL}/sitemap/cms.xml`,
      `${SITE_URL}/sitemap/blog.xml`,
      `${SITE_URL}/sitemap/vehicles.xml`,
    ],
  };
}
