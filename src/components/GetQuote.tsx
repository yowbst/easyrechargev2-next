import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GetQuoteProps {
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaHref: string;
  note?: string;
  variant?: "primary" | "muted";
}

export function GetQuote({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  note,
  variant = "muted",
}: GetQuoteProps) {
  const isPrimary = variant === "primary";

  return (
    <section
      className={cn(
        "py-16",
        isPrimary ? "bg-primary text-primary-foreground" : "bg-muted/50",
      )}
    >
      <div className="container mx-auto px-4 text-center space-y-6 max-w-2xl">
        <h2
          className={cn(
            "font-heading text-3xl font-bold",
            isPrimary && "text-primary-foreground",
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={cn(
              "text-lg",
              isPrimary ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </p>
        )}
        <Link
          href={ctaHref}
          className={cn(
            buttonVariants({
              variant: isPrimary ? "secondary" : "default",
              size: "lg",
            }),
            "px-8",
          )}
        >
          {ctaLabel}
        </Link>
        {note && (
          <p
            className={cn(
              "text-sm",
              isPrimary ? "text-primary-foreground/60" : "text-muted-foreground",
            )}
          >
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
