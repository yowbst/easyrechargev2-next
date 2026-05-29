"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface StatsTab {
  /** URL-safe key, e.g. "general". The default tab key shouldn't appear in
   * the URL — handled by the parent page. */
  key: string;
  label: string;
}

/**
 * Tab navigation for the partner stats page. Tab state lives in the
 * `?tab=…` search param so the server page re-renders with the matching
 * panel; this component just steers the URL. The default tab key is
 * omitted from the URL to keep the address clean for the common case.
 */
export function StatsTabs({
  active,
  defaultKey,
  tabs,
}: {
  active: string;
  defaultKey: string;
  tabs: StatsTab[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === defaultKey) next.delete("tab");
    else next.set("tab", value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <Tabs value={active} onValueChange={onChange}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
