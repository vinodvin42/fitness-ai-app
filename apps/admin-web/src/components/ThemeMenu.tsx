import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useTheme, type ThemeChoice } from "../lib/theme";

export const THEME_OPTIONS: { value: ThemeChoice; labelKey: string; icon: typeof Sun }[] = [
  { value: "light", labelKey: "appShell.themeLight", icon: Sun },
  { value: "dark", labelKey: "appShell.themeDark", icon: Moon },
  { value: "system", labelKey: "appShell.themeSystem", icon: Monitor },
];

/** Light, dark or follow the device (27 Oct 2026). Saved in this browser. */
export function ThemeMenu() {
  const { t } = useTranslation();
  const { choice, resolved, setChoice } = useTheme();
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("appShell.theme")} />}>
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("appShell.theme")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={choice} onValueChange={(v) => setChoice(v as ThemeChoice)}>
            {THEME_OPTIONS.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                <o.icon />
                {t(o.labelKey)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
