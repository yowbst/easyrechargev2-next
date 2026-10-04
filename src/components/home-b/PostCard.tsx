import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock } from "lucide-react";

export interface PostCardData {
  id: string;
  title: string;
  excerpt: string;
  readingTime: number;
  image: string;
  category: string;
  tag?: string;
  href: string;
}

/**
 * The Direction B article card — home guides strip, blog index and category
 * pages share it, so a post looks the same wherever it is listed.
 */
export function PostCard({
  post,
  readingTimeLabel,
  readLabel,
  priority = false,
  className = "",
  testId,
}: {
  post: PostCardData;
  /** e.g. "{n} min de lecture" — `{n}` is replaced by the post's reading time. */
  readingTimeLabel: string;
  readLabel?: string;
  priority?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <Link
      href={post.href}
      className={`group flex flex-col overflow-hidden rounded-xl border bg-card text-foreground transition-shadow hover:shadow-[0_12px_32px_-16px_rgba(7,35,26,.35)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}
      data-testid={testId}
    >
      <div className="relative aspect-[16/9] bg-b-inset">
        <Image
          src={post.image}
          alt=""
          fill
          quality={60}
          loading={priority ? "eager" : "lazy"}
          sizes="(max-width: 768px) 92vw, (max-width: 1024px) 46vw, 380px"
          className="object-cover object-center"
        />
        {post.tag && (
          <span className="absolute left-3.5 top-3.5 inline-flex h-7 items-center rounded-md bg-b-charge px-2.5 text-[13px] font-semibold text-b-on-charge">
            {post.tag}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5 md:px-6 md:pb-6 md:pt-5.5">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex h-[26px] items-center rounded-md bg-b-sand px-2.5 font-semibold">
            {post.category}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden />
            {readingTimeLabel.replace("{n}", String(post.readingTime))}
          </span>
        </div>
        <h3 className="mb-2.5 font-heading text-[22px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-2xl">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="mb-4.5 flex-1 text-[15px] leading-[1.55] text-muted-foreground">{post.excerpt}</p>
        )}
        {readLabel && (
          <span className="mt-auto inline-flex items-center gap-2 text-[15px] font-semibold text-b-link">
            {readLabel}
            <ArrowRight className="size-[15px] transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        )}
      </div>
    </Link>
  );
}
