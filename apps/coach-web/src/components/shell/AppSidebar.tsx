import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/BrandMark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { AccountMenu } from "./AccountMenu";
import { NAV_GROUPS, badgeText, type NavBadge, type NavItem } from "./nav";

export type ShellCounts = Record<NavBadge, number>;

export function isActive(item: NavItem, pathname: string) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** Laptop: full menu. Tablet: icon rail (collapsible="icon"). Phones get BottomNav instead. */
export function AppSidebar({ counts }: { counts: ShellCounts }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b px-3 group-data-[collapsible=icon]:px-2">
        <NavLink to="/" aria-label="Fynrox Coach">
          <BrandMark className="group-data-[collapsible=icon]:[&>span]:hidden" />
        </NavLink>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const count = item.badge ? counts[item.badge] : 0;
                  const label = t(item.labelKey);
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        isActive={isActive(item, pathname)}
                        tooltip={label}
                        render={<NavLink to={item.to} end={item.end} />}
                      >
                        <item.icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                      {count > 0 ? (
                        <SidebarMenuBadge className="rounded-full bg-primary px-1.5 text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground">
                          {badgeText(count)}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <AccountMenu variant="sidebar" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
