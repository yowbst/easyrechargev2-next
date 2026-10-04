import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Direction B layout primitives, shared by the home page sections.
 *
 * The design fixes a single measure (1240px, 40px gutters), one corner radius
 * and one heading scale. Keeping them here means a section never re-declares
 * them, and changing the measure is one edit rather than ten.
 */

export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1240px] px-6 md:px-10 ${className}`}>
      {children}
    </div>
  );
}

/** 13px, letter-spaced, upper-case — the small label above a section title. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="type-label mb-4 tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
}

export function SectionTitle({
  children,
  as: Tag = "h2",
  className = "",
}: {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag
      className={`type-h1 ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * Section header: title on the left, an optional link button on the right,
 * both sitting on the same baseline. Wraps to two rows on narrow screens.
 */
export function SectionHead({
  eyebrow,
  title,
  lede,
  action,
  aside,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: { label: string; href: string };
  /** Plain text shown where the action would be (e.g. a rating). */
  aside?: string;
}) {
  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
      <div className="max-w-[40rem]">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <SectionTitle>{title}</SectionTitle>
        {lede && (
          <p className="type-body mt-4 text-muted-foreground">
            {lede}
          </p>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex h-13 shrink-0 items-center gap-2.5 rounded-md bg-b-sand px-6 text-[15px] font-semibold text-foreground transition-opacity hover:opacity-85"
        >
          {action.label}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
      {!action && aside && (
        <span className="shrink-0 text-[15px] font-semibold text-muted-foreground">
          {aside}
        </span>
      )}
    </div>
  );
}
