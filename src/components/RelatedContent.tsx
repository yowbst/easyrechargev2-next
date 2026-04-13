/**
 * Internal linking section for vehicle detail pages.
 * Footer-style 3-column layout with hyperlinks to related content.
 * Server component — no client-side JS needed.
 */

import Link from "next/link";
import type { Vehicle } from "@/lib/vehicleTransformer";
import type { TransformedBlogPost } from "@/lib/blog/transform";
import type { PageRegistryEntry } from "@/lib/directus-queries";
import { getRouteSlug } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/vehicle-content-strings";

interface RelatedContentProps {
  sameBrand: Vehicle[];
  similar: Vehicle[];
  featuredPosts: TransformedBlogPost[];
  lang: string;
  pageRegistry: PageRegistryEntry[];
  strings: {
    sectionTitle: string;
    sameBrand: string;
    similar: string;
    featuredPosts: string;
  };
  brandName: string;
  modelName: string;
}

export function RelatedContent({
  sameBrand,
  similar,
  featuredPosts,
  lang,
  pageRegistry,
  strings,
  brandName,
  modelName,
}: RelatedContentProps) {
  const hasAnything = sameBrand.length > 0 || similar.length > 0 || featuredPosts.length > 0;
  if (!hasAnything) return null;

  const vehiclesPath = getRouteSlug(lang, "vehicles");
  const blogEntry = pageRegistry.find((p) => p.id === "blog");
  const blogSlug = blogEntry?.slugs[lang] || "blog";
  const sectionTitle = interpolate(strings.sectionTitle, { brand: brandName, model: modelName });

  return (
    <section className="border-t bg-muted/40 py-10">
      <div className="container mx-auto px-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-6">
          {sectionTitle}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Same brand */}
          {sameBrand.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                {interpolate(strings.sameBrand, { brand: brandName })}
              </h3>
              <ul className="space-y-1.5">
                {sameBrand.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/${lang}/${vehiclesPath}/${v.slug}`}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {v.brand} {v.model}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Similar vehicles */}
          {similar.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                {strings.similar}
              </h3>
              <ul className="space-y-1.5">
                {similar.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/${lang}/${vehiclesPath}/${v.slug}`}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {v.brand} {v.model}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Featured blog posts */}
          {featuredPosts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                {strings.featuredPosts}
              </h3>
              <ul className="space-y-1.5">
                {featuredPosts.map((post) => (
                  <li key={post.id}>
                    <Link
                      href={`/${lang}/${blogSlug}/${post.categorySlug}/${post.slug}`}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {post.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
