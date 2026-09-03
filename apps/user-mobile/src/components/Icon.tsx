import React from "react";
import {
  Activity,
  AlertTriangle,
  Apple,
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  CircleUser,
  Clock,
  Minus,
  Droplet,
  Dumbbell,
  Flame,
  Footprints,
  Globe,
  Heart,
  HeartPulse,
  Home,
  LifeBuoy,
  Lock,
  Mail,
  LineChart,
  Menu,
  MessageCircle,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { colors } from "../theme/tokens";

/**
 * Centralized icon set (docs/mobile/04-design-system.md §3 — the design uses
 * the Lucide library). Screens reference icons by name so the set stays
 * consistent and swappable in one place. Added 31 Aug 2026 (design polish).
 */
export const ICONS = {
  activity: Activity,
  "alert-triangle": AlertTriangle,
  apple: Apple,
  "arrow-left": ArrowLeft,
  bell: Bell,
  calendar: Calendar,
  check: Check,
  "chevron-right": ChevronRight,
  clock: Clock,
  minus: Minus,
  droplet: Droplet,
  dumbbell: Dumbbell,
  flame: Flame,
  footprints: Footprints,
  globe: Globe,
  heart: Heart,
  "heart-pulse": HeartPulse,
  home: Home,
  "life-buoy": LifeBuoy,
  lock: Lock,
  mail: Mail,
  "line-chart": LineChart,
  menu: Menu,
  message: MessageCircle,
  moon: Moon,
  plus: Plus,
  profile: CircleUser,
  "refresh-cw": RefreshCw,
  search: Search,
  settings: Settings,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  target: Target,
  "trending-up": TrendingUp,
  trophy: Trophy,
  utensils: Utensils,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color = colors.textPrimary, strokeWidth = 2 }: IconProps) {
  const Glyph = ICONS[name];
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} />;
}
