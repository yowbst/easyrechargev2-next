import Image from "next/image";
import { Container, SectionHead } from "./Shell";

export interface Callout {
  n: string;
  title: string;
  body: string;
}

/**
 * "La borne" — the product in its actual setting, annotated.
 *
 * The callouts are absolutely positioned over the photograph from `lg` up, as
 * drawn; below that they stack underneath it, because three overlapping cards
 * on a 390px screen would cover the thing they are pointing at.
 */
export function ProductShowcase({
  eyebrow,
  title,
  lede,
  action,
  image,
  imageAlt = "",
  callouts,
  badge,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: { label: string; href: string };
  image?: string;
  imageAlt?: string;
  callouts: Callout[];
  /** Certification strip pinned to the bottom-right of the image. */
  badge?: string;
}) {
  return (
    <section data-reveal className="bg-b-paper py-14">
      <Container>
        <SectionHead eyebrow={eyebrow} title={title} lede={lede} action={action} />

        <div className="relative overflow-hidden rounded-xl bg-b-sand">
          <div className="relative aspect-[16/10] lg:aspect-[1160/520]">
            {image ? (
              <Image
                src={image}
                alt={imageAlt}
                fill
                quality={65}
                sizes="(max-width: 1240px) 100vw, 1160px"
                className="object-cover object-center"
              />
            ) : (
              <div
                aria-hidden
                className="absolute inset-0 bg-[repeating-linear-gradient(45deg,var(--b-sand)_0_6px,color-mix(in_srgb,var(--b-sand)_82%,black)_6px_12px)]"
              />
            )}
          </div>

          {callouts.length > 0 && (
            <ul className="pointer-events-none absolute inset-y-7 left-7 hidden w-[280px] flex-col justify-between lg:flex">
              {callouts.map((c) => (
                <li
                  key={c.n}
                  className="rounded-lg bg-[color-mix(in_srgb,var(--b-paper)_96%,transparent)] px-5 py-4 backdrop-blur-sm"
                >
                  <CalloutBody {...c} />
                </li>
              ))}
            </ul>
          )}

          {badge && (
            <div className="absolute bottom-7 right-7 hidden items-center gap-3 rounded-lg bg-[color-mix(in_srgb,var(--b-forest)_94%,transparent)] px-5 py-4 text-b-on-forest backdrop-blur-sm lg:flex">
              <span
                aria-hidden
                className="size-[9px] rounded-full bg-b-signal motion-safe:animate-[er-breathe_2.4s_ease-in-out_infinite]"
              />
              <span className="text-[15px] font-medium">{badge}</span>
            </div>
          )}
        </div>

        {/* Small screens: the same annotations, stacked under the photo. */}
        {callouts.length > 0 && (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:hidden">
            {callouts.map((c) => (
              <li key={c.n} className="rounded-lg bg-b-sand px-5 py-4">
                <CalloutBody {...c} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}

function CalloutBody({ n, title, body }: Callout) {
  return (
    <>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="inline-flex size-[22px] items-center justify-center rounded-md bg-b-charge text-[13px] font-semibold text-b-on-charge">
          {n}
        </span>
        <span className="font-heading text-xl font-semibold leading-none tracking-[-0.03em]">
          {title}
        </span>
      </div>
      <p className="text-[15px] leading-[1.5] text-muted-foreground">{body}</p>
    </>
  );
}
