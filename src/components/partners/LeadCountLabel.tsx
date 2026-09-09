"use client";

import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import { usePartnerFilter } from "./PartnerFilterContext";

/**
 * The lead count under the partner name. A bare total is misleading the moment
 * a filter is on — the board shows twelve cards while the header claims
 * thirty-nine — so under a filter it reads "12 sur 39".
 *
 * Its own component because the count comes from the filter context, and
 * PartnerSidebar is the component that renders the provider.
 */
export function LeadCountLabel({
  dictionary,
  fallback,
}: {
  dictionary: PartnerDict;
  /** Server-rendered total, used on views that give the provider no leads. */
  fallback: number;
}) {
  const t = makePartnerT(dictionary);
  const { filtering, visible, total } = usePartnerFilter();

  const count = visible ?? fallback;
  const overall = total ?? fallback;
  const unit = t(count === 1 ? "header.lead" : "header.leads");

  return (
    <p className="text-xs text-muted-foreground">
      {filtering && total !== null
        ? t("header.filtered", { visible: count, total: overall })
        : `${count} ${unit}`}
    </p>
  );
}
