"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  LifeBuoy,
  CircleDashed,
  Ban,
  Archive,
  BarChart3,
  LayoutDashboard,
  Activity,
  Receipt,
  Settings,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import { PartnerLanguageSwitcher } from "./PartnerLanguageSwitcher";
import { PartnerFilterProvider, type Facets } from "./PartnerFilterContext";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import type { ScoreBands, ScoringWeights } from "@/lib/partner-facets";
import type { FilterState } from "@/lib/partner-filter-params";
import { PartnerDateFilter } from "./PartnerDateFilter";
import { PartnerSortControl } from "./PartnerSortControl";
import { PartnerFacetFilter } from "./PartnerFacetFilter";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { LeadCountLabel } from "./LeadCountLabel";

export type PartnerNav = "leads" | "stats" | "invoices";
type Lang = "fr" | "de";

export interface StatsTabAnchor {
  key: string;
  label: string;
}

// Tab key → icon is resolved client-side; we can't pass LucideIcon refs as
// props from the server page (Next.js rejects non-plain objects across the
// server/client boundary).
const STATS_TAB_ICONS: Record<string, LucideIcon> = {
  general: LayoutDashboard,
  performance: Activity,
};

// Shared shape for the top-level nav rows: 44px targets, 15px label — the
// design's sidebar is a primary surface, not a compact utility rail.
const NAV_BUTTON =
  "h-11 gap-3 rounded-lg px-3 text-[15px] font-medium text-sidebar-foreground/80 " +
  "data-active:font-semibold data-active:text-sidebar-foreground " +
  "data-active:[&_svg]:text-sidebar-primary [&_svg]:size-[18px] " +
  "group-data-[collapsible=icon]:size-11!";

const SUB_BUTTON =
  "h-9 gap-2.5 rounded-md px-2.5 text-sm text-sidebar-foreground/75 " +
  "data-active:bg-sidebar-accent/60 data-active:font-semibold " +
  "data-active:text-sidebar-foreground";

/** Which dictionary key titles the main column, per section. */
const NAV_TITLE_KEY: Record<PartnerNav, string> = {
  leads: "sidebar.leads",
  stats: "sidebar.nav.stats",
  invoices: "sidebar.nav.billing",
};

export function PartnerSidebar({
  partnerName,
  partnerToken,
  leadCount,
  supportHref,
  activeNav,
  lang,
  dictionary,
  facetOptions,
  dispatches,
  scoringWeights,
  scoreBands,
  initialFilters,
  statsTabs,
  activeStatsTab,
  defaultStatsTab,
  children,
}: {
  partnerName: string;
  partnerToken: string;
  leadCount: number;
  supportHref: string;
  activeNav: PartnerNav;
  lang: Lang;
  dictionary: PartnerDict;
  facetOptions: Facets;
  /** Leads behind the board, so the header can count what passes the filter. */
  dispatches?: PartnerDispatchCard[];
  scoringWeights?: ScoringWeights;
  scoreBands?: ScoreBands;
  /** Filter state the page parsed out of the query string. */
  initialFilters?: FilterState;
  /** Stats tab anchors to surface in the sidebar when the stats page is
   *  active. Sub-items link to `?tab=…` (the default tab key skips the
   *  query string to keep URLs clean). */
  statsTabs?: StatsTabAnchor[];
  activeStatsTab?: string;
  defaultStatsTab?: string;
  children: React.ReactNode;
}) {
  const t = makePartnerT(dictionary);

  // Track the URL hash so the Leads sub-anchors can light up the right item.
  // The leading "#" is normalised away. SSR starts empty → "En cours" reads
  // as active by default (matches "Général" under Stats).
  const [hash, setHash] = useState<string>("");
  useEffect(() => {
    const read = () => {
      const h = window.location.hash;
      setHash(h.startsWith("#") ? h.slice(1) : h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const leadsAnchor =
    hash === "leads-disqualified" || hash === "leads-closed" ? hash : "open";
  return (
    <PartnerFilterProvider
      dispatches={dispatches}
      scoringWeights={scoringWeights}
      scoreBands={scoreBands}
      initial={initialFilters}
    >
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-3 px-2 py-1.5 group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
              <span className="font-heading text-lg font-bold leading-none">
                {partnerName.slice(0, 1).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-[15px] font-semibold leading-tight">
                {partnerName}
              </p>
              <p className="mt-0.5 text-[13px] text-sidebar-foreground/60">
                {t("sidebar.space")}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeNav === "leads"}
                  tooltip={t("sidebar.leads")}
                  className={NAV_BUTTON}
                  render={<Link href={`/${lang}/partners/${partnerToken}/leads`} prefetch={false} />}
                >
                  <Users />
                  <span>{t("sidebar.leads")}</span>
                  {/* Inline rather than SidebarMenuBadge: the count is part of
                      the row's own flex line in the design, and an absolutely
                      positioned badge would sit on top of the label. */}
                  <span className="ml-auto inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-sidebar-primary px-2 text-[13px] font-semibold text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">
                    {leadCount}
                  </span>
                </SidebarMenuButton>
                {activeNav === "leads" && (
                  <SidebarMenuSub className="ml-5 gap-0.5 border-sidebar-border py-1 pl-3.5">
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        isActive={leadsAnchor === "open"}
                        className={SUB_BUTTON}
                        render={<a href="#" />}
                      >
                        <CircleDashed className="size-[15px] shrink-0" />
                        <span>{t("sidebar.nav.open")}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        isActive={leadsAnchor === "leads-disqualified"}
                        className={SUB_BUTTON}
                        render={<a href="#leads-disqualified" />}
                      >
                        <Ban className="size-[15px] shrink-0" />
                        <span>{t("sidebar.nav.disqualified")}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        isActive={leadsAnchor === "leads-closed"}
                        className={SUB_BUTTON}
                        render={<a href="#leads-closed" />}
                      >
                        <Archive className="size-[15px] shrink-0" />
                        <span>{t("sidebar.nav.closed")}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeNav === "stats"}
                  tooltip={t("sidebar.nav.stats")}
                  className={NAV_BUTTON}
                  render={<Link href={`/${lang}/partners/${partnerToken}/stats`} prefetch={false} />}
                >
                  <BarChart3 />
                  <span>{t("sidebar.nav.stats")}</span>
                </SidebarMenuButton>
                {activeNav === "stats" && statsTabs && statsTabs.length > 0 && (
                  <SidebarMenuSub className="ml-5 gap-0.5 border-sidebar-border py-1 pl-3.5">
                    {statsTabs.map((tab) => {
                      const isDefault = tab.key === defaultStatsTab;
                      const href = `/${lang}/partners/${partnerToken}/stats${
                        isDefault ? "" : `?tab=${tab.key}`
                      }`;
                      return (
                        <SidebarMenuSubItem key={tab.key}>
                          <SidebarMenuSubButton
                            isActive={activeStatsTab === tab.key}
                            className={SUB_BUTTON}
                            render={<Link href={href} prefetch={false} />}
                          >
                            {(() => {
                              const TabIcon = STATS_TAB_ICONS[tab.key];
                              return TabIcon ? (
                                <TabIcon className="size-[15px] shrink-0" />
                              ) : null;
                            })()}
                            <span>{tab.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeNav === "invoices"}
                  tooltip={t("sidebar.nav.billing")}
                  className={NAV_BUTTON}
                  render={<Link href={`/${lang}/partners/${partnerToken}/invoices`} prefetch={false} />}
                >
                  <Receipt />
                  <span>{t("sidebar.nav.billing")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Coming soon — settings, disabled with a "Bientôt" badge. */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  aria-disabled
                  tooltip={t("sidebar.nav.settings")}
                  className={`${NAV_BUTTON} opacity-40`}
                >
                  <Settings />
                  <span>{t("sidebar.nav.settings")}</span>
                  <span className="ml-auto inline-flex h-[22px] shrink-0 items-center rounded-md border border-sidebar-border px-2 text-[11px] font-medium uppercase tracking-[0.06em] group-data-[collapsible=icon]:hidden">
                    {t("sidebar.nav.soon")}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t("sidebar.help")}
                className={NAV_BUTTON}
                render={<a href={supportHref} />}
              >
                <LifeBuoy />
                <span>{t("sidebar.help")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {/* Language + theme sit at the foot of the sidebar on every
              breakpoint, which keeps the top bar for filters alone. Hidden
              when the desktop sidebar is icon-collapsed. */}
          <div className="flex items-center gap-2 px-1 pb-1 group-data-[collapsible=icon]:hidden">
            <PartnerLanguageSwitcher lang={lang} />
            <ThemeToggle />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5 md:px-6">
          <SidebarTrigger className="-ml-1 size-10" />
          <div className="min-w-0 flex-1">
            {/* The section, not the company: the partner already knows who
                they are, and the sidebar says so directly above. */}
            <h1 className="truncate font-heading text-xl font-semibold tracking-tight">
              {t(NAV_TITLE_KEY[activeNav])}
            </h1>
            <LeadCountLabel dictionary={dictionary} fallback={leadCount} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <PartnerFacetFilter options={facetOptions} dictionary={dictionary} />
            {activeNav === "leads" && <PartnerSortControl dictionary={dictionary} />}
            <PartnerDateFilter dictionary={dictionary} />
          </div>
        </header>
        <div className="flex flex-col gap-5 p-4 md:p-6">
          <ActiveFilterChips options={facetOptions} dictionary={dictionary} />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
    </PartnerFilterProvider>
  );
}
