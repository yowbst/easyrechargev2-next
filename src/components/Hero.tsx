"use client";

import { Badge } from "@/components/ui/badge";
import * as LucideIcons from "lucide-react";
import { useEffect } from "react";
import { cmsImage } from "@/lib/directusAssets";

interface HeroProps {
  title?: string;
  subtitle?: string;
  checksConfig?: string[];
  checks?: Record<string, string>;
  rating?: string;
  children?: React.ReactNode;
  pageId?: string;
  image?: string;
}

export function Hero({
  title,
  subtitle,
  checksConfig = [],
  checks = {},
  rating,
  children,
  pageId,
  image,
}: HeroProps) {
  const resolvedImage = image || "/og-default.webp";

  // Build responsive srcset for CMS images
  const optimised = cmsImage(resolvedImage, [640, 1024, 1920], { quality: 80 });
  const heroSrc = optimised.src;
  const heroSrcSet = optimised.srcSet;
  const heroSizes = optimised.sizes;

  // Inject <link rel="preload"> for LCP hero image
  useEffect(() => {
    const existing = document.querySelector(`link[rel="preload"][href="${heroSrc}"]`);
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = heroSrc;
    if (heroSrcSet) link.setAttribute("imagesrcset", heroSrcSet);
    if (heroSizes) link.setAttribute("imagesizes", heroSizes);
    link.fetchPriority = "high";
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [heroSrc, heroSrcSet, heroSizes]);

  return (
    // IMPORTANT: overflow-visible so autocomplete dropdown isn't clipped
    <section className="relative overflow-visible min-h-[950px] md:min-h-[1000px]">
      {/* Background Image with Overlay - Fixed Height */}
      <div className="absolute inset-0 h-[950px] md:h-[1000px] z-0">
        <img
          src={heroSrc}
          srcSet={heroSrcSet}
          sizes={heroSizes}
          alt="EV Charging"
          fetchPriority="high"
          decoding="sync"
          width={1920}
          height={1000}
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 to-slate-900/40" />
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 w-full pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="max-w-3xl">
          {/* Trust Badge */}
          {!!rating && (
            <Badge className="mb-6 bg-white/20 backdrop-blur-md border-white/30 text-white hover:bg-white/30">
              <LucideIcons.Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
              <span>{rating}</span>
            </Badge>
          )}

          {!!title && (
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-heading font-bold text-white mb-6 leading-tight">
              {title}
            </h1>
          )}

          {!!subtitle && (
            <p className="text-lg text-white/90 mb-8 leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          )}

          {/* Quick Quote Form (MiniQuoteForm or other child) */}
          {children && <div className="mb-6">{children}</div>}

          {/* Trust Indicators */}
          <div className="flex flex-wrap gap-6 text-sm text-white/80">
            {(checksConfig.length > 0
              ? checksConfig
              : ["freeQuote", "certifiedPartners", "swissPlatform"]
            ).map((checkId) => (
              <div
                key={checkId}
                className="flex items-center gap-2"
                data-testid={`check-${checkId}`}
              >
                <span className="text-green-400">✓</span>
                <span>{checks[checkId] || `[hero.checks.${checkId}]`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
