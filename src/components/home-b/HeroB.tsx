import { Container } from "./Shell";

export interface HeroStat {
  /** Big figure, e.g. "48". */
  value: string;
  /** Smaller unit rendered inline after it, e.g. "h" or "/5". */
  unit?: string;
  label: string;
}

/**
 * Direction B hero.
 *
 * The previous hero was a full-bleed photograph with white text over a dark
 * scrim; this one is a two-column split on the paper ground — argument on the
 * left, the quote engine on the right — so the form is visible without
 * scrolling and no longer competes with a background image for contrast.
 */
export function HeroB({
  badgeValue,
  badgeLabel,
  title,
  subtitle,
  stats,
  children,
}: {
  /** Highlighted figure in the pill above the title (e.g. installations). */
  badgeValue?: string;
  badgeLabel?: string;
  title: string;
  subtitle?: string;
  stats: HeroStat[];
  /** The quote engine — rendered inside the right-hand card. */
  children?: React.ReactNode;
}) {
  return (
    <section className="bg-b-paper pb-14 pt-10">
      <Container>
        <div className="grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div className="lg:pt-8">
            {badgeLabel && (
              <div className="mb-8 inline-flex h-9 items-center gap-2.5 rounded-lg bg-b-sand px-2">
                {badgeValue && (
                  <span className="inline-flex h-6 items-center rounded-md bg-b-charge px-2.5 text-[13px] font-semibold text-b-on-charge">
                    {badgeValue}
                  </span>
                )}
                <span className="pr-2.5 text-[15px] font-medium text-muted-foreground">
                  {badgeLabel}
                </span>
              </div>
            )}

            <h1 className="font-heading font-semibold leading-[1.02] tracking-[-0.04em] text-[clamp(2.5rem,6vw,4.25rem)]">
              {title}
            </h1>

            {subtitle && (
              <p className="mt-6 max-w-[31rem] text-[clamp(1.0625rem,2vw,1.25rem)] leading-[1.6] text-muted-foreground">
                {subtitle}
              </p>
            )}

            {stats.length > 0 && (
              <dl className="mt-10 grid grid-cols-3 gap-6 border-t pt-8">
                {stats.map((s) => (
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd>
                      <span className="font-heading text-[2rem] font-semibold leading-none tracking-[-0.04em]">
                        {s.value}
                        {s.unit && (
                          <span className="text-xl">{` ${s.unit}`}</span>
                        )}
                      </span>
                      <span className="mt-2.5 block text-[15px] leading-[1.45] text-muted-foreground">
                        {s.label}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Quote engine: a paper card inside a sand frame, which is what
              lifts it off the ground without a border or a heavy shadow. */}
          {children && (
            <div className="rounded-xl bg-b-sand p-3">
              <div className="rounded-lg bg-b-paper p-6 shadow-[0_12px_32px_-12px_rgba(12,59,39,0.18)] sm:p-7">
                {children}
              </div>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
