"use client";

import Link from "next/link";
import { Users, LifeBuoy, CircleDashed, Ban, Archive } from "lucide-react";
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
import { PartnerFilterProvider } from "./PartnerFilterContext";
import { PartnerDateFilter } from "./PartnerDateFilter";
import { PartnerSortControl } from "./PartnerSortControl";

export type PartnerNav = "crm";
type Lang = "fr" | "de";

export function PartnerSidebar({
  partnerName,
  partnerToken,
  leadCount,
  supportHref,
  activeNav,
  lang,
  dictionary,
  children,
}: {
  partnerName: string;
  partnerToken: string;
  leadCount: number;
  supportHref: string;
  activeNav: PartnerNav;
  lang: Lang;
  dictionary: PartnerDict;
  children: React.ReactNode;
}) {
  const t = makePartnerT(dictionary);
  return (
    <PartnerFilterProvider>
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200">
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
                  isActive={activeNav === "crm"}
                  tooltip={t("sidebar.crm")}
                  className="font-medium"
                  render={<Link href={`/${lang}/partners/${partnerToken}/crm`} prefetch={false} />}
                >
                  <Users className="h-4 w-4" />
                  <span>{t("sidebar.crm")}</span>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton render={<a href="#crm-open" />}>
                      <CircleDashed className="h-3.5 w-3.5 shrink-0" />
                      <span>{t("sidebar.nav.open")}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton render={<a href="#crm-disqualified" />}>
                      <Ban className="h-3.5 w-3.5 shrink-0" />
                      <span>{t("sidebar.nav.disqualified")}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton render={<a href="#crm-closed" />}>
                      <Archive className="h-3.5 w-3.5 shrink-0" />
                      <span>{t("sidebar.nav.closed")}</span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
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
            <PartnerSortControl dictionary={dictionary} />
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
