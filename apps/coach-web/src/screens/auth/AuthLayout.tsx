import { useState, type ReactNode } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/BrandMark";
import { ThemeMenu } from "@/components/shell/ThemeMenu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Signed-out frame, the same design as the redesigned coach login (26 Oct
 * 2026): a brand panel with what coaches get on laptops and tablets in
 * landscape, one column with the brand on top on phones.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const benefits = [t("auth.layout.benefitMatched"), t("auth.layout.benefitSummary"), t("auth.layout.benefitDecide")];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0a0a0a] p-10 text-white lg:flex xl:p-14">
        <div aria-hidden className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full bg-primary/20 blur-3xl" />
        <BrandMark onDark className="relative" />
        <div className="relative max-w-md space-y-7">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{t("auth.layout.eyebrow")}</p>
          <h1 className="font-heading text-5xl leading-[1.05] font-bold tracking-tight xl:text-6xl">
            {t("auth.layout.headline")}
            <br />
            <span className="text-primary">{t("auth.layout.headlineAccent")}</span>
          </h1>
          <ul className="space-y-3.5">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[15px] text-white/80">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/50">{t("auth.layout.help")}</p>
      </aside>

      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-6">
          <BrandMark className="lg:invisible" />
          <ThemeMenu />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0">
          <div className="w-full max-w-[400px] space-y-6">{children}</div>
        </div>
        <p className="px-4 pb-6 text-center text-xs text-muted-foreground lg:hidden">{t("auth.layout.help")}</p>
      </div>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="font-heading text-[28px] leading-tight font-bold tracking-tight">{title}</h2>
      <p className="text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <Field id={id} label={label}>
      <div className="relative">
        <Input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 pr-11"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}
