"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { useLocalitySearch } from "@/hooks/useLocalitySearch";
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
  dropdownClassName?: string;
}) {
  const { value, onValueChange, onSelect } = props;
  const [open, setOpen] = useState(false);

  const { items, loading } = useLocalitySearch(value, {
    limit: props.limit ?? 5,
    locale: props.locale,
  });

  return (
    <div className="relative">
      <MapPin className={props.iconClassName ?? "absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10 pointer-events-none"} />
      <Input
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(e.target.value.trim().length >= 2);
        }}
        placeholder={props.placeholder}
        onFocus={() => value.trim().length >= 2 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        data-testid={props.dataTestId}
        className={props.inputClassName ?? "h-12 pl-12"}
      />

      {open && items.length > 0 && (
        <div
          className={
            props.dropdownClassName ??
            "absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-[220px] overflow-auto"
          }
        >
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
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-lg shadow-lg z-50 p-3 text-sm text-muted-foreground">
          Aucun résultat
        </div>
      )}
    </div>
  );
}
