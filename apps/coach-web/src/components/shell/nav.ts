import {
  BadgeCheck,
  CalendarDays,
  CircleHelp,
  Clapperboard,
  Gauge,
  Inbox,
  IndianRupee,
  LayoutDashboard,
  MessageSquare,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

/** Which shell counter a menu entry shows. */
export type NavBadge = "waiting" | "unread" | "inbox" | "formReviews";

export type NavItem = { to: string; labelKey: string; icon: LucideIcon; badge?: NavBadge; end?: boolean };
export type NavGroup = { labelKey: string; items: NavItem[] };

/**
 * One menu for every screen size. Laptop shows it in full, tablet as an icon
 * rail, phone as the bottom tabs (PHONE_TABS) plus the More page (the rest).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "web.nav.main",
    items: [
      { to: "/", labelKey: "web.nav.today", icon: LayoutDashboard, end: true },
      { to: "/inbox", labelKey: "web.nav.inbox", icon: Inbox, badge: "inbox" },
      { to: "/clients", labelKey: "web.nav.clients", icon: Users, badge: "waiting" },
      { to: "/calendar", labelKey: "web.nav.calendar", icon: CalendarDays },
      { to: "/messages", labelKey: "web.nav.messages", icon: MessageSquare, badge: "unread" },
      { to: "/form-reviews", labelKey: "web.nav.formReviews", icon: Clapperboard, badge: "formReviews" },
    ],
  },
  {
    labelKey: "web.nav.business",
    items: [
      { to: "/earnings", labelKey: "web.nav.earnings", icon: IndianRupee },
      { to: "/availability", labelKey: "web.nav.availability", icon: Gauge },
    ],
  },
  {
    labelKey: "web.nav.account",
    items: [
      { to: "/profile", labelKey: "web.nav.profile", icon: UserRound },
      { to: "/verification", labelKey: "web.nav.verification", icon: BadgeCheck },
      { to: "/help", labelKey: "web.nav.help", icon: CircleHelp },
    ],
  },
];

/** Bottom tabs on a phone: the same five the old app had. */
export const PHONE_TABS: NavItem[] = [
  { to: "/", labelKey: "web.nav.today", icon: LayoutDashboard, end: true },
  { to: "/clients", labelKey: "web.nav.clients", icon: Users, badge: "waiting" },
  { to: "/calendar", labelKey: "web.nav.calendar", icon: CalendarDays },
  { to: "/messages", labelKey: "web.nav.messages", icon: MessageSquare, badge: "unread" },
];

export const badgeText = (n: number) => (n > 99 ? "99+" : String(n));
