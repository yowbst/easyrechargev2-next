import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

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

  return (
    // IMPORTANT: overflow-visible so autocomplete dropdown isn't clipped
    <section className="relative overflow-visible min-h-[950px] md:min-h-[1000px]">
      {/* Background Image with Overlay - Fixed Height */}
      <div className="absolute inset-0 h-[950px] md:h-[1000px] z-0">
        <Image
          src={resolvedImage}
          alt=""
          fill
          priority
          // LCP element on every template that uses this hero. `priority`
          // alone only preloads; without fetchPriority the browser queues the
          // image at Low priority behind CSS/fonts/JS on slow mobile networks.
          fetchPriority="high"
          quality={60}
          sizes="(max-width: 1024px) 100vw, 1920px"
          className="object-cover object-center brightness-105 saturate-105 dark:brightness-100 dark:saturate-100"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/70 to-slate-900/30 dark:from-slate-900/80 dark:to-slate-900/40" />
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 w-full pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="max-w-3xl">
          {/* Trust Badge */}
          {!!rating && (
            <Badge className="mb-6 bg-white/20 backdrop-blur-md border-white/30 text-white hover:bg-white/30">
              <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
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
