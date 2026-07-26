"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { useLocalitySearch } from "@/hooks/useLocalitySearch";
import { dropdownPlacement } from "@/lib/dropdownPlacement";
import type { LocalityResponse } from "@/lib/localities";

export function LocalityAutocomplete(props: {
  value: string;
  onValueChange: (v: string) => void;
  onSelect: (loc: LocalityResponse) => void;
  placeholder?: string;
  limit?: number;
  locale?: string;
  dataTestId?: string;
  inputClassName?: string;
  iconClassName?: string;
  /** Skin only (colors/border/shadow) — positioning and max-height are owned by the component. */
  dropdownClassName?: string;
  /** Focus the input on mount on fine-pointer (desktop) devices. */
  autoFocusOnFine?: boolean;
}) {
  const { value, onValueChange, onSelect } = props;
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [geometry, setGeometry] = useState<{ dir: "down" | "up"; maxHeight: number }>({ dir: "down", maxHeight: 220 });

  const { items, loading } = useLocalitySearch(value, {
    limit: props.limit ?? 5,
    locale: props.locale,
  });

  const updateGeometry = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const res = dropdownPlacement({ top: r.top, bottom: r.bottom }, vh);
    setGeometry({ dir: res.placement, maxHeight: res.maxHeight });
  };

  // Desktop-only autofocus: popping the mobile keyboard uninvited is worse
  // than one extra tap, so gate on a fine pointer. Runs once on mount.
  useEffect(() => {
    if (!props.autoFocusOnFine) return;
    const raf = requestAnimationFrame(() => {
      if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, []);

  const skin = props.dropdownClassName ?? "bg-popover border border-border rounded-lg shadow-lg";
  const positioned = `absolute left-0 right-0 z-50 overflow-auto ${geometry.dir === "up" ? "bottom-full mb-2" : "top-full mt-2"} ${skin}`;

  return (
    <div className="relative">
      <MapPin className={props.iconClassName ?? "absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10 pointer-events-none"} />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          const shouldOpen = e.target.value.trim().length >= 2;
          if (shouldOpen) updateGeometry();
          setOpen(shouldOpen);
        }}
        placeholder={props.placeholder}
        onFocus={() => {
          if (value.trim().length >= 2) {
            updateGeometry();
            setOpen(true);
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        data-testid={props.dataTestId}
        className={props.inputClassName ?? "h-12 pl-12"}
      />

      {open && items.length > 0 && (
        <div className={positioned} style={{ maxHeight: geometry.maxHeight }}>
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center px-4 py-3 cursor-pointer hover:bg-muted transition-colors"
              onMouseDown={() => {
                onSelect(item);
                setOpen(false);
              }}
            >
              <MapPin className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">
                {item.postalCode} {item.locality}
              </span>
              <Badge variant="secondary" className="ml-2">
                {item.canton}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {open && !loading && value.trim().length >= 2 && items.length === 0 && (
        <div className={`${positioned} p-3 text-sm text-muted-foreground`}>
          Aucun résultat
        </div>
      )}
    </div>
  );
}
