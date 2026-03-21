import Link from "next/link";
import { cmsBgImage } from "@/lib/directusAssets";

interface GetQuoteProps {
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaHref: string;
  note?: string;
  variant?: "primary" | "muted";
  image?: string;
  className?: string;
}

export function GetQuote({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  note,
  variant = "primary",
  image,
  className = "",
}: GetQuoteProps) {
  const hasImage = !!image;

  const variantStyles = {
    primary: {
      section: "py-24 bg-primary text-primary-foreground",
      description: "text-lg mb-8 opacity-90 max-w-3xl mx-auto",
      buttonClass: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      note: "text-sm mt-4 opacity-75 max-w-xl mx-auto",
    },
    muted: {
      section: "py-24 bg-muted/30 border-t mt-0",
      description: "text-lg text-muted-foreground mb-8 max-w-2xl mx-auto",
      buttonClass: "bg-primary text-primary-foreground hover:bg-primary/80",
      note: "text-sm mt-4 text-muted-foreground max-w-xl mx-auto",
    },
  };

  const styles = variantStyles[variant];

  return (
    <section
      className={`relative overflow-hidden ${hasImage ? "py-24" : styles.section} ${className}`}
      style={hasImage ? { backgroundImage: `url(${cmsBgImage(image!)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      data-testid="section-get-quote"
    >
      {hasImage && <div className="absolute inset-0 bg-slate-900/70" />}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <h2 className={`text-3xl md:text-4xl font-heading font-bold mb-4 ${hasImage ? "text-white" : ""}`}>
          {title}
        </h2>
        {subtitle && !subtitle.startsWith("[") && (
          <p className={hasImage ? "text-lg mb-8 text-white/75 max-w-3xl mx-auto" : styles.description}>
            {subtitle}
          </p>
        )}
        <div className="flex flex-col items-center gap-4">
          <Link
            href={ctaHref}
            className={`inline-flex items-center justify-center min-w-[240px] rounded-lg h-9 px-4 text-sm font-medium transition-colors ${
              hasImage ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : styles.buttonClass
            }`}
            data-testid="button-get-quote-cta"
          >
            {ctaLabel}
          </Link>
          {note && !note.startsWith("[") && (
            <p
              className={hasImage ? "text-sm mt-4 text-white/60 max-w-xl mx-auto" : styles.note}
              data-testid="text-get-quote-note"
            >
              {note}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
