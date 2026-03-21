import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/**
 * Directus webhook handler for on-demand ISR revalidation.
 * Directus fires this when content changes; we invalidate the relevant cache tags.
 */

const COLLECTION_TAG_MAP: Record<string, string[]> = {
  site_settings: ["layout"],
  pages: ["page-registry"],
  blog_posts: ["blog-posts"],
  vehicles: ["vehicles"],
  vehicle_brands: ["vehicle-brands"],
};

export async function POST(req: Request) {
  const secret = process.env.DIRECTUS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    );
  }

  const auth =
    req.headers.get("x-webhook-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/, "");
  if (auth !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json();
    const collection = payload?.collection;

    if (!collection) {
      return NextResponse.json(
        { error: "Missing collection in payload" },
        { status: 400 },
      );
    }

    const tags = COLLECTION_TAG_MAP[collection] || [];

    // Also revalidate specific item tags if we can identify them
    const keys = Array.isArray(payload?.keys)
      ? payload.keys
      : payload?.key
        ? [payload.key]
        : [];

    if (collection === "pages" && keys.length > 0) {
      // Revalidate specific page tags
      for (const key of keys) {
        tags.push(`page-${key}`);
      }
    }

    if (collection === "blog_posts") {
      // Revalidate specific blog post tags by slug if available
      const slug = payload?.payload?.slug;
      if (slug) tags.push(`blog-post-${slug}`);
    }

    if (collection === "vehicles") {
      const slug = payload?.payload?.slug;
      if (slug) tags.push(`vehicle-${slug}`);
    }

    // Revalidate all affected paths using revalidatePath
    // In Next.js 16, revalidateTag requires a cache profile; revalidatePath is simpler for webhooks
    const revalidated: string[] = [];

    // Map tags to paths for revalidation
    for (const tag of tags) {
      if (tag === "layout") {
        // Layout affects all pages — revalidate the entire site
        revalidatePath("/", "layout");
        revalidated.push("/ (layout)");
      } else if (tag === "page-registry") {
        revalidatePath("/", "layout");
        revalidated.push("/ (page-registry)");
      } else if (tag.startsWith("page-")) {
        revalidatePath("/", "layout");
        revalidated.push(tag);
      } else if (tag === "blog-posts" || tag.startsWith("blog-post-")) {
        revalidatePath("/", "layout");
        revalidated.push(tag);
      } else if (tag === "vehicles" || tag.startsWith("vehicle-")) {
        revalidatePath("/", "layout");
        revalidated.push(tag);
      } else if (tag === "vehicle-brands") {
        revalidatePath("/", "layout");
        revalidated.push(tag);
      }
    }

    console.log(
      `[Webhook] Collection: ${collection}, revalidated: ${revalidated.join(", ") || "none"}`,
    );

    return NextResponse.json({
      revalidated: revalidated.length,
      tags: revalidated,
    });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 },
    );
  }
}
