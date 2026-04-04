"use client";

import { useState, useEffect } from "react";
import type { ComponentType } from "react";

// Convert PascalCase icon name to kebab-case file name
// e.g., "CheckCircle" → "check-circle", "MapPin" → "map-pin"
function toKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

const iconCache = new Map<string, ComponentType<{ className?: string }>>();

type Props = {
  name?: string | null;
  className?: string;
};

export function LucideCmsIcon({ name, className = "" }: Props) {
  const [Icon, setIcon] = useState<ComponentType<{ className?: string }> | null>(
    name && iconCache.has(name) ? iconCache.get(name)! : null,
  );

  useEffect(() => {
    if (!name) return;
    if (iconCache.has(name)) {
      setIcon(() => iconCache.get(name)!);
      return;
    }
    const kebab = toKebab(name);
    import(`lucide-react/dist/esm/icons/${kebab}.js`)
      .then((mod) => {
        const Comp = mod.default || mod[name];
        if (Comp) {
          iconCache.set(name, Comp);
          setIcon(() => Comp);
        }
      })
      .catch(() => {
        // Icon not found — silently ignore
      });
  }, [name]);

  if (!Icon) return null;
  return <Icon className={className} />;
}
