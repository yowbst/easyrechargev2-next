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
  SidebarMenuBadge,
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
import { PartnerDateFilter } from "./PartnerDateFilter";
import { PartnerSortControl } from "./PartnerSortControl";
import { PartnerFacetFilter } from "./PartnerFacetFilter";

export type PartnerNav = "leads" | "stats";
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

export function PartnerSidebar({
  partnerName,
  partnerToken,
  leadCount,
  supportHref,
  activeNav,
  lang,
  dictionary,
  facetOptions,
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
    <PartnerFilterProvider>
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200 group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7">
              <span className="text-sm font-semibold">
                {partnerName.slice(0, 1)}
              </span>
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold">{partnerName}</p>
              <p className="text-xs text-muted-foreground">
                {t("sidebar.space")}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeNav === "leads"}
                  tooltip={t("sidebar.leads")}
                  className="font-medium"
                  render={<Link href={`/${lang}/partners/${partnerToken}/leads`} prefetch={false} />}
                >
                  <Users className="h-4 w-4" />
                  <span>{t("sidebar.leads")}</span>
                </SidebarMenuButton>
                {activeNav === "leads" && (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        isActive={leadsAnchor === "open"}
                        render={<a href="#" />}
                      >
                        <CircleDashed className="h-3.5 w-3.5 shrink-0" />
                        <span>{t("sidebar.nav.open")}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        isActive={leadsAnchor === "leads-disqualified"}
                        render={<a href="#leads-disqualified" />}
                      >
                        <Ban className="h-3.5 w-3.5 shrink-0" />
                        <span>{t("sidebar.nav.disqualified")}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        isActive={leadsAnchor === "leads-closed"}
                        render={<a href="#leads-closed" />}
                      >
                        <Archive className="h-3.5 w-3.5 shrink-0" />
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
                  className="font-medium"
                  render={<Link href={`/${lang}/partners/${partnerToken}/stats`} prefetch={false} />}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>{t("sidebar.nav.stats")}</span>
                </SidebarMenuButton>
                {activeNav === "stats" && statsTabs && statsTabs.length > 0 && (
                  <SidebarMenuSub>
                    {statsTabs.map((tab) => {
                      const isDefault = tab.key === defaultStatsTab;
                      const href = `/${lang}/partners/${partnerToken}/stats${
                        isDefault ? "" : `?tab=${tab.key}`
                      }`;
                      return (
                        <SidebarMenuSubItem key={tab.key}>
                          <SidebarMenuSubButton
                            isActive={activeStatsTab === tab.key}
                            render={<Link href={href} prefetch={false} />}
                          >
                            {(() => {
                              const TabIcon = STATS_TAB_ICONS[tab.key];
                              return TabIcon ? (
                                <TabIcon className="h-3.5 w-3.5 shrink-0" />
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

              {/* Coming soon — billing + settings, disabled with a "Bientôt" badge. */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  aria-disabled
                  tooltip={t("sidebar.nav.billing")}
                  className="font-medium"
                >
                  <Receipt className="h-4 w-4" />
                  <span>{t("sidebar.nav.billing")}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>{t("sidebar.nav.soon")}</SidebarMenuBadge>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled
                  aria-disabled
                  tooltip={t("sidebar.nav.settings")}
                  className="font-medium"
                >
                  <Settings className="h-4 w-4" />
                  <span>{t("sidebar.nav.settings")}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>{t("sidebar.nav.soon")}</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t("sidebar.help")}
                render={<a href={supportHref} />}
              >
                <LifeBuoy className="h-4 w-4" />
                <span>{t("sidebar.help")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{partnerName}</h1>
            <p className="text-xs text-muted-foreground">
              {leadCount} {t(leadCount === 1 ? "header.lead" : "header.leads")}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <PartnerFacetFilter options={facetOptions} dictionary={dictionary} />
            {activeNav === "leads" && <PartnerSortControl dictionary={dictionary} />}
            <PartnerDateFilter dictionary={dictionary} />
            <PartnerLanguageSwitcher lang={lang} />
            <ThemeToggle />
          </div>
        </header>
        <div className="p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
    </PartnerFilterProvider>
  );
}
