"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePostHog } from "@/components/PostHogProvider";

/**
 * Fires `<event>_viewed` once when half of the section is on screen, and
 * `<event>_cta_clicked` when a descendant link carrying `data-cta` is clicked.
 * The section itself stays server-rendered; this only wraps it.
 */
export function TrackedSection({
  event,
  props,
  className,
  children,
  as: Tag = "div",
  ...rest
}: {
  event: string;
  props: Record<string, string | number | boolean | null>;
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "aside";
} & Record<`aria-${string}`, string>) {
  const ph = usePostHog();
  const ref = useRef<HTMLElement>(null);
  const seen = useRef(false);
  const key = JSON.stringify(props);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && ph && !seen.current) {
          seen.current = true;
          ph.capture(`${event}_viewed`, JSON.parse(key));
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ph, event, key]);

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a[data-cta]");
    if (a && ph) ph.capture(`${event}_cta_clicked`, { ...JSON.parse(key), cta: a.getAttribute("data-cta") });
  };

  return (
    <Tag ref={ref as never} className={className} onClick={onClick} {...rest}>
      {children}
    </Tag>
  );
}
