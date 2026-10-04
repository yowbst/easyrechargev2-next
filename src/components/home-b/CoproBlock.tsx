import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";
import { Container, Eyebrow, SectionTitle } from "./Shell";

/**
 * Copropriétés / PPE. The obstacle in a co-owned building is administrative,
 * not technical, so the block leads with what the AGM actually needs to vote.
 */
export function CoproBlock({
  eyebrow,
  title,
  lede,
  points,
  action,
  image,
  imageAlt = "",
  statValue,
  statLabel,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  points: string[];
  action?: { label: string; href: string };
  image?: string;
  imageAlt?: string;
  /** Figure pinned over the image, e.g. "12 places". */
  statValue?: string;
  statLabel?: string;
}) {
  return (
    <section data-reveal className="bg-b-paper py-14">
      <Container>
        <div className="grid items-center gap-10 rounded-xl bg-b-sand p-8 md:p-14 lg:grid-cols-2 lg:gap-14">
          {/* min-w-0 + break-words: German compounds ("Eigentümerversammlung")
              are wider than a 390 px column and would push the page sideways. */}
          <div className="min-w-0 break-words">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <SectionTitle>{title}</SectionTitle>
            {lede && (
              <p className="type-body mt-4 text-muted-foreground">
                {lede}
              </p>
            )}

            {points.length > 0 && (
              <ul className="mt-7 flex flex-col gap-3.5">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-md bg-b-charge"
                    >
                      <Check className="size-[13px] text-b-on-charge" />
                    </span>
                    <span className="text-[15px] leading-[1.55]">{p}</span>
                  </li>
                ))}
              </ul>
            )}

            {action && (
              <Link
                href={action.href}
                className="mt-8 inline-flex h-14 items-center rounded-md bg-b-forest px-7 text-[17px] font-semibold text-b-on-forest transition-opacity hover:opacity-90"
              >
                {action.label}
              </Link>
            )}
          </div>

          {/* 16:10 rather than the design's 4:3. The photograph is 1.83:1, and a
              4:3 crop would cut ~27% off each side — taking with it the row of
              wall chargers along the right-hand wall, which is the whole point
              of the picture. */}
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-b-inset">
            {image ? (
              <Image
                src={image}
                alt={imageAlt}
                fill
                quality={65}
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-cover object-center"
              />
            ) : (
              <div
                aria-hidden
                className="absolute inset-0 bg-[repeating-linear-gradient(45deg,var(--b-inset)_0_6px,color-mix(in_srgb,var(--b-inset)_82%,black)_6px_12px)]"
              />
            )}
            {statValue && (
              <div className="absolute bottom-6 left-6 rounded-lg bg-[color-mix(in_srgb,var(--b-paper)_96%,transparent)] px-5 py-4">
                <p className="font-heading text-[2rem] font-semibold leading-none tracking-[-0.04em]">
                  {statValue}
                </p>
                {statLabel && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {statLabel}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
