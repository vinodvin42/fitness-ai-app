import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { fetchMyPhoto } from "@/api/professionalPhoto";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { THEME_OPTIONS } from "./ThemeMenu";

export function initials(name: string | undefined | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function useMyPhoto() {
  return useQuery({ queryKey: ["professional-photo"], queryFn: fetchMyPhoto, staleTime: 5 * 60_000 });
}

export function CoachAvatar({ className }: { className?: string }) {
  const { professional } = useAuth();
  const photo = useMyPhoto().data;
  return (
    <Avatar className={className ?? "size-8 rounded-lg"}>
      {photo?.imageData ? <AvatarImage src={photo.imageData} alt="" /> : null}
      <AvatarFallback className="rounded-[inherit] bg-primary/15 text-xs font-semibold text-primary-ink">
        {initials(professional?.fullName)}
      </AvatarFallback>
    </Avatar>
  );
}

/** The coach's name, photo, theme and sign out. A sidebar row on laptop and tablet, an avatar on a phone. */
export function AccountMenu({ variant }: { variant: "sidebar" | "avatar" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { professional, logout } = useAuth();
  const { choice, setChoice } = useTheme();

  const content = (
    <DropdownMenuContent align="end" side={variant === "sidebar" ? "top" : "bottom"} className="w-60">
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex items-center gap-2 py-2 text-foreground">
          <CoachAvatar />
          <span className="grid min-w-0 text-left">
            <span className="truncate text-sm font-semibold">{professional?.fullName}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{professional?.email}</span>
          </span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => navigate("/profile")}>
        <UserRound />
        {t("web.nav.profile")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("web.theme.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(v) => setChoice(v as ThemeChoice)}>
          {THEME_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              <o.icon />
              {t(o.labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
        <LogOut />
        {t("web.account.signOut")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (variant === "avatar") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-lg" aria-label={t("web.account.menu")} />}>
          <CoachAvatar className="size-7 rounded-lg" />
        </DropdownMenuTrigger>
        {content}
      </DropdownMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" aria-label={t("web.account.menu")} className="data-popup-open:bg-sidebar-accent" />}
          >
            <CoachAvatar />
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold">{professional?.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">{professional?.email}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          {content}
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
