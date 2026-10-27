import { Bell, Menu } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFormReviewsToDo, useShellCounts } from "@/lib/coachAlerts";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./AccountMenu";
import { AppSidebar, isActive, type ShellCounts } from "./AppSidebar";
import { ThemeMenu } from "./ThemeMenu";
import { PHONE_TABS, badgeText } from "./nav";

/** Tablets (768–1023 px) open on the icon rail; laptops on the full menu. */
const startsOpen = () => typeof window === "undefined" || window.innerWidth >= 1024;

/**
 * The signed-in frame. Laptop: sidebar + top bar. Tablet: icon rail + top bar.
 * Phone: top bar + bottom tabs, with everything else under More.
 */
export function AppShell() {
  const isMobile = useIsMobile();
  const { waiting, unread, inbox } = useShellCounts({ poll: true });
  const formReviews = useFormReviewsToDo();
  const counts: ShellCounts = { waiting, unread, inbox, formReviews };

  return (
    <SidebarProvider defaultOpen={startsOpen()}>
      {isMobile ? null : <AppSidebar counts={counts} />}
      <SidebarInset className="min-w-0">
        <TopBar isMobile={isMobile} inbox={inbox} />
        <div className={cn("flex-1", isMobile && "pb-[calc(4rem+env(safe-area-inset-bottom))]")}>
          <Outlet />
        </div>
        {isMobile ? <BottomNav counts={counts} /> : null}
      </SidebarInset>
    </SidebarProvider>
  );
}

function TopBar({ isMobile, inbox }: { isMobile: boolean; inbox: number }) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-4">
      {isMobile ? (
        <NavLink to="/" aria-label="Fynrox Coach">
          <BrandMark />
        </NavLink>
      ) : (
        <SidebarTrigger className="-ml-1" />
      )}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={inbox > 0 ? t("web.inboxCount", { count: inbox }) : t("web.nav.inbox")}
          render={<NavLink to="/inbox" />}
        >
          <Bell />
          {inbox > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {badgeText(inbox)}
            </span>
          ) : null}
        </Button>
        <ThemeMenu />
        {isMobile ? <AccountMenu variant="avatar" /> : null}
      </div>
    </header>
  );
}

function BottomNav({ counts }: { counts: ShellCounts }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const onTab = PHONE_TABS.some((tab) => isActive(tab, pathname));
  const items = [...PHONE_TABS.map((tab) => ({ ...tab, active: isActive(tab, pathname) })), { to: "/more", labelKey: "web.nav.more", icon: Menu, badge: undefined, end: false, active: !onTab }];
  return (
    <nav
      aria-label={t("web.nav.main")}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      {items.map((item) => {
        const count = item.badge ? counts[item.badge] : 0;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors",
              item.active && "text-primary-ink",
            )}
          >
            <span className="relative">
              <item.icon className="size-5" strokeWidth={item.active ? 2.4 : 2} />
              {count > 0 ? (
                <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {badgeText(count)}
                </span>
              ) : null}
            </span>
            {t(item.labelKey)}
          </NavLink>
        );
      })}
    </nav>
  );
}
