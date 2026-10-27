import type { ReactNode } from "react";
import { AlertCircle, ChevronLeft, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Page building blocks. Every signed-in screen is
 * <Page><PageHeader/>…sections…</Page>, so spacing, widths and states look
 * the same everywhere. `width` picks the column: "narrow" for forms and
 * settings, "default" for lists, "wide" for dashboards and two-pane views.
 */
const WIDTHS = { narrow: "max-w-2xl", default: "max-w-4xl", wide: "max-w-6xl", full: "max-w-none" } as const;

export function Page({ children, width = "default", className }: { children: ReactNode; width?: keyof typeof WIDTHS; className?: string }) {
  return <main className={cn("mx-auto w-full space-y-6 px-4 py-5 md:px-6 md:py-7 lg:px-8", WIDTHS[width], className)}>{children}</main>;
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A link shown above the title, e.g. back to the list. */
  back?: { to: string; label: string };
}) {
  return (
    <div className="space-y-2">
      {back ? (
        <Link to={back.to} className="-ml-1 inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight md:text-[28px]">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function Section({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      {title || actions ? (
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-0.5">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: "default" | "primary" }) {
  return (
    <Card size="sm" className={cn(tone === "primary" && "bg-primary/10 ring-primary/25")}>
      <CardContent className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{label}</span>
          {Icon ? <Icon className="size-4" /> : null}
        </div>
        <div className="font-heading text-2xl font-bold tabular-nums tracking-tight">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center", className)}>
      {Icon ? (
        <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center">
      <AlertCircle className="size-5 shrink-0 text-destructive" />
      <div className="flex-1">
        <p className="font-medium">{t("common.somethingWentWrong")}</p>
        <p className="text-muted-foreground">{message ?? t("common.checkConnection")}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label={t("web.loading")}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** A tappable list row: avatar or icon, two lines and a trailing slot. Renders a Link when `to` is set. */
export function RowLink({ to, onClick, leading, title, subtitle, trailing, className }: { to?: string; onClick?: () => void; leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; className?: string }) {
  const inner = (
    <>
      {leading}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate font-medium">{title}</span>
        {subtitle ? <span className="truncate text-sm text-muted-foreground">{subtitle}</span> : null}
      </span>
      {trailing}
    </>
  );
  const cls = cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none", className);
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** A card holding RowLinks with dividers between them. */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn("gap-0 divide-y py-0", className)}>{children}</Card>;
}
