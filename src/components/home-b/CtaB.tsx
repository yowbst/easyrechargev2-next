import Link from "next/link";
import { Container } from "./Shell";

/**
 * Closing call to action. The one Charge-green field on the page, so it reads
 * as the end of the argument rather than another card.
 */
export function CtaB({
  title,
  subtitle,
  primary,
  secondary,
  note,
}: {
  title: string;
  subtitle?: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  note?: string;
}) {
  return (
    <section className="bg-b-paper py-14">
      <Container>
        <div className="grid items-center gap-10 rounded-xl bg-b-charge px-8 py-14 text-b-on-charge lg:grid-cols-[1.2fr_0.8fr] lg:gap-14 lg:px-14 lg:py-[4.5rem]">
          <div>
            <h2 className="font-heading font-semibold leading-[1.06] tracking-[-0.04em] text-[clamp(2rem,4vw,2.75rem)]">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-4 max-w-[30rem] text-[17px] leading-[1.65] opacity-80">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href={primary.href}
              className="inline-flex h-15 items-center justify-center rounded-md bg-b-forest px-6 text-[17px] font-semibold text-b-on-forest transition-opacity hover:opacity-90"
              data-testid="button-get-quote-cta"
            >
              {primary.label}
            </Link>
            {secondary && (
              <Link
                href={secondary.href}
                className="inline-flex h-15 items-center justify-center rounded-md border-[1.5px] border-current/35 px-6 text-[17px] font-semibold transition-opacity hover:opacity-80"
              >
                {secondary.label}
              </Link>
            )}
            {note && (
              <p className="mt-1.5 text-center text-sm opacity-75">{note}</p>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
