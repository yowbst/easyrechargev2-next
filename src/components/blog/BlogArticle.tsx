import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Clock, Minus, Plus, User } from "lucide-react";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import { LucideCmsIcon } from "@/components/LucideCmsIcon";
import { Container, Eyebrow, SectionTitle } from "@/components/home-b/Shell";
import { PostCard, type PostCardData } from "@/components/home-b/PostCard";
import { CtaB } from "@/components/home-b/CtaB";
import type { PageRegistryEntry } from "@/lib/directus-queries";

/** Same Forest re-colouring of the shared mini-quote card as on the blog index. */
const FOREST_SCOPE =
  "[--card:#07231a] [--card-foreground:#f3f1eb] [--foreground:#f3f1eb] [--muted-foreground:rgba(243,241,235,.78)] [--border:rgba(243,241,235,.22)] [--primary:#16a34a] [--primary-foreground:#04150c] [--muted:rgba(243,241,235,.08)] [--accent:rgba(243,241,235,.08)] [--accent-foreground:#f3f1eb] [--input:rgba(243,241,235,.22)] [&>*]:rounded-xl [&>*]:border-0 [&>*]:shadow-none";

export interface BlogArticleProps {
  lang: string;
  labels: {
    back: string;
    published?: string;
    faqTitle: string;
    expertAdviceTitle: string;
    takeawaysTitle: string;
    authorLabel?: string;
    relatedEyebrow?: string;
    relatedTitle?: string;
    relatedAll?: string;
    relatedRead?: string;
  };
  blogHref: string;
  categoryName: string;
  tagNames: string[];
  readingTimeLabel: string;
  title: string;
  /** Lede under the title — the editor's SEO description, when there is one. */
  lede?: string;
  author?: { name: string; credentials?: string | null; portrait?: string | null } | null;
  date?: string;
  dateTime?: string;
  image: string;
  bodyHtml: string;
  noContentLabel: string;
  faq: Array<{ question: string; answer: string }>;
  expertAdviceHtml?: string;
  expertAdviceIcon?: string;
  takeawaysHtml?: string;
  takeawaysIcon?: string;
  related: PostCardData[];
  relatedReadingTime: (minutes: number) => string;
  cta?: { title: string; subtitle?: string; label: string; href: string; note?: string };
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
}

/**
 * Blog article, Direction B (design 12 Blog — article): header on the paper,
 * wide image, a 680 px reading column with a 360 px side column on desktop
 * whose mini-quote stays pinned. On mobile the side column is split: key points right after the
 * header, the mini-quote after the body and before the FAQ.
 */
export function BlogArticle(p: BlogArticleProps) {
  const miniQuote = (
    <div className={FOREST_SCOPE}>
      <MiniQuoteCard pageId="blog-post" dictionary={p.dictionary} pageRegistry={p.pageRegistry} lang={p.lang} />
    </div>
  );

  const takeaways = p.takeawaysHtml ? (
    <div className="rounded-xl border bg-b-inset p-5 md:p-6" data-testid="card-article-takeaways">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-b-paper">
          <LucideCmsIcon name={p.takeawaysIcon || "ClipboardList"} className="size-4.5 text-b-link" />
        </span>
        <span className="text-base font-semibold">{p.labels.takeawaysTitle}</span>
      </div>
      <div
        className="article-body text-[15px]! leading-[1.55]! [&_li]:mb-2! [&_p]:mb-2! [&_ul]:mb-0!"
        data-testid="article-takeaways-content"
        dangerouslySetInnerHTML={{ __html: p.takeawaysHtml }}
      />
    </div>
  ) : null;

  const expertAdvice = p.expertAdviceHtml ? (
    <div className="rounded-xl bg-b-sand p-5 md:p-6" data-testid="card-expert-advice">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-b-paper">
          <LucideCmsIcon name={p.expertAdviceIcon || "Lightbulb"} className="size-4.5 text-b-link" />
        </span>
        <span className="text-base font-semibold">{p.labels.expertAdviceTitle}</span>
      </div>
      <div
        className="article-body text-[15px]! leading-[1.6]! [&_p]:mb-2! [&_p:last-child]:mb-0!"
        dangerouslySetInnerHTML={{ __html: p.expertAdviceHtml }}
      />
    </div>
  ) : null;

  const faq = p.faq.length > 0 && (
    <div className="mt-10 md:mt-12">
      <h2 className="mb-3 font-heading text-[26px] font-semibold leading-[1.18] tracking-[-0.03em] md:text-[32px]">
        {p.labels.faqTitle}
      </h2>
      <div className="border-t">
        {p.faq.map((item, i) => (
          // Native disclosure: answers stay in the DOM for the FAQPage schema.
          <details key={i} open={i === 0} className="group border-b">
            <summary className="flex min-h-15 cursor-pointer list-none items-center gap-4 py-3.5 text-[17px] font-semibold leading-snug md:min-h-16 md:text-lg [&::-webkit-details-marker]:hidden">
              <span className="flex-1">{item.question}</span>
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-b-sand text-foreground group-open:bg-b-forest group-open:text-b-on-forest">
                <Plus className="size-4 group-open:hidden" aria-hidden />
                <Minus className="hidden size-4 group-open:block" aria-hidden />
              </span>
            </summary>
            <p className="pb-5.5 text-[17px] leading-[1.6] text-foreground/85 md:pr-12">{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );

  const portrait = (size: string, icon: string) =>
    p.author?.portrait ? (
      <Image
        src={p.author.portrait}
        alt=""
        width={64}
        height={64}
        className={`${size} shrink-0 rounded-lg object-cover`}
      />
    ) : (
      <span className={`${size} inline-flex shrink-0 items-center justify-center rounded-lg bg-b-inset text-muted-foreground`}>
        <User className={icon} aria-hidden />
      </span>
    );

  return (
    <div data-direction-b className="bg-b-paper">
      <Container className="pt-3 md:pt-5">
        <Link
          href={p.blogHref}
          className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-b-link hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {p.labels.back}
        </Link>
      </Container>

      {/* Header */}
      <Container className="pt-3 pb-6 md:pt-6 md:pb-10">
        <div className="max-w-[840px]">
          <div className="mb-4 flex flex-wrap items-center gap-2.5 md:mb-5.5">
            <span
              className="inline-flex h-7 items-center rounded-md bg-b-sand px-2.5 text-sm font-semibold text-muted-foreground md:h-7.5 md:px-3"
              data-testid="badge-article-category"
            >
              {p.categoryName}
            </span>
            {p.tagNames.map((tag) => (
              <span key={tag} className="inline-flex h-7 items-center rounded-md border px-2.5 text-sm text-muted-foreground">
                {tag}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground md:text-[15px]" data-testid="text-article-reading-time">
              <Clock className="size-3.5" aria-hidden />
              {p.readingTimeLabel}
            </span>
          </div>
          <h1
            className="mb-3.5 font-heading text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] md:mb-5 md:text-[56px] md:leading-[1.04] md:tracking-[-0.04em]"
            data-testid="text-article-title"
          >
            {p.title}
          </h1>
          {p.lede && (
            <p className="mb-5 max-w-[720px] text-lg leading-[1.6] text-muted-foreground md:mb-7 md:text-xl" data-testid="text-article-excerpt">
              {p.lede}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
            {p.author?.name && (
              <div className="flex items-center gap-3">
                {portrait("size-10 md:size-12", "size-5")}
                <div>
                  <div className="text-[15px] font-semibold leading-tight">{p.author.name}</div>
                  {p.author.credentials && (
                    <div className="text-sm text-muted-foreground max-md:hidden">{p.author.credentials}</div>
                  )}
                  {p.date && <div className="text-sm text-muted-foreground md:hidden">{p.date}</div>}
                </div>
              </div>
            )}
            {p.date && (
              <>
                {p.author?.name && <span aria-hidden className="mx-1.5 h-8 w-px bg-border max-md:hidden" />}
                <span
                  className={`text-[15px] text-muted-foreground ${p.author?.name ? "max-md:hidden" : ""}`}
                  data-testid="text-article-date"
                >
                  {p.labels.published ? `${p.labels.published} ` : ""}
                  <time dateTime={p.dateTime}>{p.date}</time>
                </span>
              </>
            )}
          </div>
        </div>
      </Container>

      {/* Image */}
      <div className="md:mx-auto md:max-w-[1240px] md:px-10 md:pb-14">
        <div className="relative aspect-[16/10] overflow-hidden bg-b-inset md:aspect-[21/9] md:rounded-xl">
          <Image
            src={p.image}
            alt={p.title}
            fill
            priority
            fetchPriority="high"
            quality={65}
            sizes="(max-width: 1240px) 100vw, 1160px"
            className="object-cover"
            data-testid="img-article-hero"
          />
        </div>
      </div>

      {/* Body + side column */}
      <Container className="pb-16 md:pb-28">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,680px)_360px] lg:justify-between lg:gap-20">
          <div className="min-w-0">
            {takeaways && <div className="mt-6 mb-7 lg:hidden">{takeaways}</div>}

            <article className="article-body max-md:pt-1" data-testid="article-body">
              {p.bodyHtml ? (
                <div dangerouslySetInnerHTML={{ __html: p.bodyHtml }} />
              ) : (
                <p className="text-muted-foreground">{p.noContentLabel}</p>
              )}
            </article>

            <div className="mt-8 flex flex-col gap-6 lg:hidden">
              {miniQuote}
              {expertAdvice}
            </div>

            {faq}

            {p.author?.name && (
              <div className="mt-14 flex max-w-[680px] items-start gap-4.5 rounded-xl bg-b-sand p-6">
                {portrait("size-16", "size-6")}
                <div>
                  {p.labels.authorLabel && (
                    <div className="type-label mb-2 tracking-[0.1em] text-muted-foreground">{p.labels.authorLabel}</div>
                  )}
                  <div className="mb-1 text-[17px] font-semibold leading-tight">{p.author.name}</div>
                  {p.author.credentials && <div className="text-[15px] text-muted-foreground">{p.author.credentials}</div>}
                </div>
              </div>
            )}
          </div>

          {/* Side column: key points and expert advice scroll with the page;
              only the mini-quote stays pinned. All three together are taller
              than the viewport, so a fully sticky column hid its bottom until
              the end of the article. */}
          <aside className="hidden flex-col gap-5 self-stretch lg:flex">
            {takeaways}
            {expertAdvice}
            <div className="sticky top-22">{miniQuote}</div>
          </aside>
        </div>
      </Container>

      {/* Related — same category */}
      {p.related.length > 0 && p.labels.relatedTitle && (
        <section className="pb-16 md:pb-28">
          <Container>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
              <div>
                {p.labels.relatedEyebrow && <Eyebrow>{p.labels.relatedEyebrow}</Eyebrow>}
                <SectionTitle>{p.labels.relatedTitle}</SectionTitle>
              </div>
              {p.labels.relatedAll && (
                <Link
                  href={p.blogHref}
                  className="inline-flex h-13 shrink-0 items-center gap-2.5 rounded-md bg-b-sand px-6 text-[15px] font-semibold transition-opacity hover:opacity-85"
                >
                  {p.labels.relatedAll}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {p.related.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  readingTimeLabel={p.relatedReadingTime(post.readingTime)}
                  readLabel={p.labels.relatedRead}
                />
              ))}
            </div>
          </Container>
        </section>
      )}

      {p.cta && (
        <div className="pb-14">
          <CtaB
            title={p.cta.title}
            subtitle={p.cta.subtitle}
            primary={{ label: p.cta.label, href: p.cta.href }}
            note={p.cta.note}
          />
        </div>
      )}
    </div>
  );
}
