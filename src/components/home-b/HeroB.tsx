import { Container } from "./Shell";
import { HeroBackdrop } from "./HeroBackdrop";

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
 * Full-height and image-led: the photograph carries the promise, the argument
 * sits on it in cream, and the quote engine rides on top as a paper card.
 *
 * The scrim is forest green rather than the neutral slate the old hero used —
 * a grey wash over a warm photograph is what made the previous version read as
 * a stock template. It is a left-weighted gradient so the text side is dark
 * enough for AA contrast while the right side of the picture stays visible
 * behind and around the card.
 *
 * Without an image it falls back to the paper ground and ink text, so the
 * section still stands up before anyone uploads a photograph.
 */
export function HeroB({
  badgeValue,
  badgeLabel,
  title,
  subtitle,
  stats,
  images,
  imageAlt = "",
  rotateSeconds,
  children,
}: {
  /** Highlighted figure in the pill above the title (e.g. installations). */
  badgeValue?: string;
  badgeLabel?: string;
  title: string;
  subtitle?: string;
  stats: HeroStat[];
  /** Full-bleed background photographs. The first is the LCP element; any
   *  others fade in on a timer after the page has painted. */
  images: string[];
  imageAlt?: string;
  /** Seconds between images. Omit or set 0 to hold on the first. */
  rotateSeconds?: number;
  /** The quote engine — rendered inside the right-hand card. */
  children?: React.ReactNode;
}) {
  const onImage = images.length > 0;

  return (
    <section
      className={`relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden py-12 md:py-16 ${
        onImage ? "text-b-on-forest" : "bg-b-paper"
      }`}
    >
      {onImage && (
        <>
          <HeroBackdrop
            images={images}
            alt={imageAlt}
            intervalMs={Math.max(3, rotateSeconds ?? 8) * 1000}
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,color-mix(in_srgb,var(--b-forest)_92%,transparent)_0%,color-mix(in_srgb,var(--b-forest)_78%,transparent)_42%,color-mix(in_srgb,var(--b-forest)_35%,transparent)_100%)]"
          />
        </>
      )}

      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            {badgeLabel && (
              <div
                className={`mb-8 inline-flex h-9 items-center gap-2.5 rounded-lg px-2 ${
                  onImage
                    ? "bg-[color-mix(in_srgb,var(--b-on-forest)_14%,transparent)] backdrop-blur-sm"
                    : "bg-b-sand"
                }`}
              >
                {badgeValue && (
                  <span className="inline-flex h-6 items-center rounded-md bg-b-charge px-2.5 text-[13px] font-semibold text-b-on-charge">
                    {badgeValue}
                  </span>
                )}
                <span
                  className={`pr-2.5 text-[15px] font-medium ${
                    onImage ? "opacity-90" : "text-muted-foreground"
                  }`}
                >
                  {badgeLabel}
                </span>
              </div>
            )}

            <h1 className="type-display max-w-[16ch]">
              {title}
            </h1>

            {subtitle && (
              <p
                className={`type-body mt-6 max-w-[34rem] text-[clamp(1.0625rem,2vw,1.25rem)] ${
                  onImage ? "opacity-85" : "text-muted-foreground"
                }`}
              >
                {subtitle}
              </p>
            )}

            {stats.length > 0 && (
              <dl
                className={`mt-10 grid grid-cols-3 gap-6 border-t pt-8 ${
                  onImage
                    ? "border-[color-mix(in_srgb,var(--b-on-forest)_25%,transparent)]"
                    : ""
                }`}
              >
                {stats.map((s) => (
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd>
                      <span className="font-heading text-[2rem] font-semibold leading-none tracking-[-0.04em]">
                        {s.value}
                        {s.unit && <span className="text-xl">{` ${s.unit}`}</span>}
                      </span>
                      <span
                        className={`mt-2.5 block text-[15px] leading-[1.45] ${
                          onImage ? "opacity-80" : "text-muted-foreground"
                        }`}
                      >
                        {s.label}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Quote engine: a paper card inside a sand frame, which lifts it off
              the photograph without a border or a heavy shadow. */}
          {children && (
            <div className="rounded-xl bg-b-sand p-3 text-foreground shadow-[0_24px_64px_-24px_rgba(4,21,12,0.55)]">
              <div className="rounded-lg bg-b-paper p-6 sm:p-7">{children}</div>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
