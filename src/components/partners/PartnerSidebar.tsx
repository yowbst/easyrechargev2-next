"use client";

import Link from "next/link";
import { Users, LifeBuoy } from "lucide-react";
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
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PartnerLanguageSwitcher } from "./PartnerLanguageSwitcher";

export type PartnerNav = "crm";
type Lang = "fr" | "de";

export function PartnerSidebar({
  partnerName,
  partnerToken,
  leadCount,
  supportHref,
  activeNav,
  lang,
  children,
}: {
  partnerName: string;
  partnerToken: string;
  leadCount: number;
  supportHref: string;
  activeNav: PartnerNav;
  lang: Lang;
  children: React.ReactNode;
}) {
  return (
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
              <p className="text-xs text-muted-foreground">Espace partenaire</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeNav === "crm"}
                  tooltip="CRM"
                  className="font-medium"
                  render={<Link href={`/${lang}/partners/${partnerToken}/crm`} prefetch={false} />}
                >
                  <Users className="h-4 w-4" />
                  <span>CRM</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Demander de l'aide"
                render={<a href={supportHref} />}
              >
                <LifeBuoy className="h-4 w-4" />
                <span>Aide</span>
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
              {leadCount} {leadCount === 1 ? "lead" : "leads"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <PartnerLanguageSwitcher lang={lang} />
            <ThemeToggle />
          </div>
        </header>
        <div className="p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
