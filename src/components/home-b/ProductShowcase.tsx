import Image from "next/image";
import { Container, SectionHead } from "./Shell";

export interface Callout {
  n: string;
  title: string;
  body: string;
  /** Marker position over the photograph, as `"x,y"` percentages. */
  pin?: string;
}

/**
 * "La borne" — the product, annotated.
 *
 * Two columns: the photograph carries numbered markers, and the numbers are
 * explained in the panel beside it. The earlier version floated the
 * explanations over the picture, which meant the cards covered the thing they
 * described and nothing was legible below `lg`. Splitting them lets the photo
 * be a photo and the text be text, and the layout collapses to one column on
 * its own — the markers stay on the image, the panel moves under it.
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
  /** Certification line closing the panel. */
  badge?: string;
}) {
  return (
    <section data-reveal className="bg-b-paper py-14">
      <Container>
        <SectionHead eyebrow={eyebrow} title={title} lede={lede} action={action} />

        <div className="grid items-stretch gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,21.25rem),1fr))]">
          <div className="relative max-h-[640px] min-w-0 overflow-hidden rounded-xl bg-b-inset [aspect-ratio:964/848] md:min-h-[440px]">
            {image ? (
              <Image
                src={image}
                alt={imageAlt}
                fill
                quality={70}
                sizes="(max-width: 1240px) 100vw, 600px"
                // Anchored right, matching the design's `xMaxYMid slice`: the
                // crop keeps the charger, the cable and the connector, and
                // gives up the shelving on the far left. The marker
                // percentages below are measured against that same window.
                className="object-cover object-right"
              />
            ) : (
              <div
                aria-hidden
                className="absolute inset-0 bg-[repeating-linear-gradient(45deg,var(--b-inset)_0_6px,color-mix(in_srgb,var(--b-inset)_82%,black)_6px_12px)]"
              />
            )}

            {/* Markers are decorative: every number is repeated in the panel
                beside the image, where it carries its explanation. */}
            {callouts.map((c) => {
              const [x, y] = (c.pin ?? "").split(",").map((v) => v.trim());
              if (!x || !y) return null;
              return (
                <span
                  key={c.n}
                  aria-hidden
                  style={{ left: `${x}%`, top: `${y}%` }}
                  className="absolute inline-flex size-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[10px] border-[3px] border-b-paper bg-b-charge text-[26px] font-semibold leading-none text-b-on-charge"
                >
                  {c.n}
                </span>
              );
            })}
          </div>

          <div className="flex flex-col justify-center rounded-xl bg-b-sand px-6 py-3 md:px-9">
            <ol>
              {callouts.map((c, i) => (
                <li
                  key={c.n}
                  className={`flex items-start gap-[18px] py-6 ${i > 0 ? "border-t" : ""}`}
                >
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-b-charge text-[15px] font-semibold text-b-on-charge">
                    {c.n}
                  </span>
                  <div>
                    <p className="type-h3 mb-2 text-[22px]">
                      {c.title}
                    </p>
                    <p className="text-base leading-[1.55] text-[color-mix(in_srgb,var(--foreground)_78%,var(--b-paper))]">
                      {c.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {badge && (
              <p className="flex items-center gap-3 pb-3 pt-5 text-[15px] font-semibold leading-[1.4]">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full bg-b-charge motion-safe:animate-[er-breathe_2.4s_ease-in-out_infinite]"
                />
                {badge}
              </p>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
