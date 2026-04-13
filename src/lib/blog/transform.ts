/**
 * Shared blog post transformation — converts raw Directus blog post
 * into a UI-ready object. Extracted from page-level inline transforms.
 */

import { DIRECTUS_URL } from "@/lib/directus";
import { getDateLocale } from "@/lib/i18n/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export interface TransformedBlogPost {
  id: string;
  title: string;
  excerpt: string;
  slug: string;
  readingTime: number;
  image: string;
  date: string;
  category: string;
  categorySlug: string;
  categoryId: string;
  tags: Array<{ id: string; name: string; slug: string }>;
}

function parseReadingTime(v: unknown): number {
  if (!v) return 5;
  if (typeof v === "number") return v;
  const match = String(v).match(/^(\d+):(\d+):(\d+)$/);
  if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  return parseInt(String(v), 10) || 5;
}

export function transformBlogPost(post: AnyRecord, lang: string): TransformedBlogPost {
  const pt = post.translations?.[0];
  const ct = post.category?.translations?.[0];
  const tags = (post.tags || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((tj: any) => {
      const tag = tj?.blog_tags_id;
      const tt = tag?.translations?.[0];
      if (!tag) return null;
      return { id: tag.tag_id || tag.id, name: tt?.name || tag.tag_id || "", slug: tt?.slug || "" };
    })
    .filter(Boolean);
  const dateValue = post.date_published || post.date_created;
  return {
    id: String(post.id),
    title: pt?.title || "",
    excerpt: pt?.excerpt || "",
    slug: pt?.slug || post.slug || String(post.id),
    readingTime: parseReadingTime(post.reading_time),
    image: post.image ? `${DIRECTUS_URL}/assets/${post.image}` : "/og-default.webp",
    date: dateValue
      ? new Date(dateValue).toLocaleDateString(getDateLocale(lang), {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "",
    category: ct?.name || "Guide",
    categorySlug: ct?.slug || "guide",
    categoryId: post.category?.category_id || post.category?.key || post.category?.id || "",
    tags,
  };
}
