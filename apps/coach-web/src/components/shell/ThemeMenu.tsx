import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemeChoice } from "@/lib/theme";

export const THEME_OPTIONS: { value: ThemeChoice; labelKey: string; icon: typeof Sun }[] = [
  { value: "light", labelKey: "web.theme.light", icon: Sun },
  { value: "dark", labelKey: "web.theme.dark", icon: Moon },
  { value: "system", labelKey: "web.theme.system", icon: Monitor },
];

/** Light, dark or follow the device. Saved in this browser. */
export function ThemeMenu() {
  const { t } = useTranslation();
  const { choice, resolved, setChoice } = useTheme();
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("web.theme.label")} />}>
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The same choice as three segmented buttons, for the Profile and More pages. */
export function ThemeSegmented() {
  const { t } = useTranslation();
  const { choice, setChoice } = useTheme();
  return (
    <div role="radiogroup" aria-label={t("web.theme.label")} className="inline-flex rounded-lg border bg-muted/50 p-0.5">
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          onClick={() => setChoice(o.value)}
          className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm"
        >
          <o.icon className="size-4" />
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
}
