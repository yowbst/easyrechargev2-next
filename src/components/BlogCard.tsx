"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";
import { cmsImage } from "@/lib/directusAssets";
import { t } from "@/lib/i18n/dictionaries";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface BlogCardProps {
  id: string;
  title: string;
  category: string;
  categorySlug: string;
  slug: string;
  readingTime: number;
  image: string;
  date?: string;
  excerpt?: string;
  tag?: string;
  showCategory?: boolean;
  variant?: "default" | "compact" | "dark";
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
}

export function BlogCard({
  id,
  title,
  category,
  categorySlug,
  slug,
  readingTime,
  image,
  date,
  excerpt,
  tag,
  showCategory = true,
  variant = "default",
  dictionary,
  pageRegistry,
}: BlogCardProps) {
  const pathname = usePathname();

  const lang = pathname.match(/^\/([a-z]{2})(\/|$)/)?.[1] || "fr";
  const blogEntry = pageRegistry.find((p) => p.id === "blog");
  const blogSlug = blogEntry?.slugs[lang] || "blog";
  const articleUrl = `/${lang}/${blogSlug}/${categorySlug}/${slug}`;

  const isCompact = variant === "compact";
  const isDark = variant === "dark";

  return (
    <Link href={articleUrl} title={title}>
      <Card
        className={`overflow-hidden hover-elevate transition-all duration-300 h-full group ${
          isCompact ? "flex flex-col" : ""
        } ${isDark ? "bg-white/10 backdrop-blur-md border-white/15" : ""}`}
        data-testid={`card-blog-${id}`}
      >
        <div className={isCompact ? "h-48 overflow-hidden" : "aspect-video overflow-hidden"}>
          <img
            {...cmsImage(image, [400, 700])}
            alt={title}
            loading="lazy"
            width={700}
            height={394}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${isDark ? "brightness-125" : ""}`}
          />
        </div>
        <div className={isCompact ? "p-4 flex flex-col flex-1" : "p-6"}>
          <div className={`flex items-center gap-2 flex-wrap ${isCompact ? "mb-2" : "mb-3"}`}>
            {showCategory && (
              <Badge
                variant="secondary"
                data-testid={`badge-category-${id}`}
                className={isDark ? "bg-white/15 text-white border-white/20" : isCompact ? "bg-background/90 backdrop-blur" : ""}
              >
                {category}
              </Badge>
            )}
            {tag && (
              <Badge
                variant="secondary"
                data-testid={`badge-tag-${id}`}
                className={isDark ? "bg-white/15 text-white border-white/20" : isCompact ? "bg-background/90 backdrop-blur" : ""}
              >
                {tag}
              </Badge>
            )}
            <div className={`flex items-center gap-1 text-xs ${isDark ? "text-white/50" : "text-muted-foreground"}`}>
              <Clock className="h-3 w-3" />
              <span>
                {t(dictionary, "shared.blogCard.readingTime.label_one", {
                  count: readingTime,
                })}
              </span>
            </div>
          </div>
          <h3 className={`font-heading font-semibold line-clamp-2 group-hover:text-primary transition-colors ${
            isCompact ? "text-lg mb-2" : "text-xl mb-2"
          } ${isDark ? "text-white" : ""}`}>
            {title}
          </h3>
          {isCompact && excerpt && (
            <p className={`text-sm mb-2 line-clamp-2 flex-1 ${isDark ? "text-white/60" : "text-muted-foreground"}`}>
              {excerpt}
            </p>
          )}
          {!isCompact && date && (
            <div className={`text-sm ${isDark ? "text-white/50" : "text-muted-foreground"}`}>{date}</div>
          )}
        </div>
      </Card>
    </Link>
  );
}
