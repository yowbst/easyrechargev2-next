import Image from "next/image";

interface HeroProps {
  title: string;
  subtitle?: string;
  checks?: string[];
  rating?: string;
  image?: string;
  children?: React.ReactNode;
}

export function Hero({
  title,
  subtitle,
  checks,
  rating,
  image,
  children,
}: HeroProps) {
  return (
    <section className="relative bg-gradient-to-b from-primary/5 to-background overflow-hidden">
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-lg md:text-xl text-muted-foreground max-w-xl">
                {subtitle}
              </p>
            )}

            {checks && checks.length > 0 && (
              <ul className="flex flex-col gap-2">
                {checks.map((check, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs">
                      ✓
                    </span>
                    {check}
                  </li>
                ))}
              </ul>
            )}

            {rating && (
              <p className="text-sm text-muted-foreground">{rating}</p>
            )}

            {/* Interactive island (e.g. MiniQuoteForm) */}
            {children}
          </div>

          {image && (
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden">
              <Image
                src={image}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
