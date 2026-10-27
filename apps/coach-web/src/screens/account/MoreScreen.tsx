import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Gauge,
  Handshake,
  Inbox,
  IndianRupee,
  LogOut,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { fetchFormReviews } from "@/api/formReviews";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListCard, Page, PageHeader, RowLink, Section } from "@/components/page";
import { CoachAvatar } from "@/components/shell/AccountMenu";
import { ThemeSegmented } from "@/components/shell/ThemeMenu";
import { badgeText } from "@/components/shell/nav";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useShellCounts } from "@/lib/coachAlerts";

/**
 * More, ported from apps/coach-mobile's MoreScreen: every destination that
 * isn't a bottom tab on a phone (Inbox, Form reviews with its to-review
 * count, Earnings, Availability, Offers, My profile, Verification, Help),
 * the theme, and Sign out behind a confirmation. Laptops reach the same
 * pages from the sidebar, but the page works there too.
 */
export function MoreScreen() {
  const { t } = useTranslation();
  const { professional, logout } = useAuth();
  // Same query key as the Form reviews list, so this is one cached request.
  const formReviews = useQuery({ queryKey: ["coach-form-reviews"], queryFn: fetchFormReviews });
  const toReview = (formReviews.data ?? []).filter((r) => r.status === "queued").length;
  const { inbox } = useShellCounts();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Page width="narrow">
      <PageHeader title={t("more.title")} />

      <Link
        to="/profile"
        aria-label={t("web.settings.more.openProfile")}
        className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60"
      >
        <CoachAvatar className="size-12 rounded-full" />
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-semibold">{professional?.fullName}</span>
          <span className="truncate text-sm text-muted-foreground">{professional?.email}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>

      <Section title={t("web.settings.more.coaching")}>
        <ListCard>
          <MenuRow
            to="/inbox"
            icon={Inbox}
            label={t("web.settings.more.inbox.label")}
            subtitle={t("web.settings.more.inbox.subtitle")}
            badge={inbox > 0 ? badgeText(inbox) : undefined}
          />
          <MenuRow
            to="/form-reviews"
            icon={Clapperboard}
            label={t("more.formReviews.label")}
            subtitle={t("more.formReviews.subtitle")}
            badge={toReview > 0 ? t("more.needsReview", { count: toReview }) : undefined}
          />
          <MenuRow to="/clients/offers" icon={Handshake} label={t("more.offers.label")} subtitle={t("more.offers.subtitle")} />
        </ListCard>
      </Section>

      <Section title={t("web.settings.more.business")}>
        <ListCard>
          <MenuRow to="/earnings" icon={IndianRupee} label={t("more.earnings.label")} subtitle={t("more.earnings.subtitle")} />
          <MenuRow to="/availability" icon={Gauge} label={t("more.availability.label")} subtitle={t("more.availability.subtitle")} />
        </ListCard>
      </Section>

      <Section title={t("more.account")}>
        <ListCard>
          <MenuRow to="/profile" icon={UserRound} label={t("more.profile.label")} subtitle={t("more.profile.subtitle")} />
          <MenuRow to="/verification" icon={BadgeCheck} label={t("more.verification.label")} subtitle={t("more.verification.subtitle")} />
          <MenuRow to="/help" icon={CircleHelp} label={t("more.help.label")} subtitle={t("more.help.subtitle")} />
        </ListCard>
      </Section>

      <Section title={t("web.settings.more.appearance")}>
        <Card size="sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{t("web.settings.profile.appearanceHelp")}</span>
            <ThemeSegmented />
          </CardContent>
        </Card>
      </Section>

      <ListCard>
        <RowLink
          onClick={() => setConfirmSignOut(true)}
          leading={<MenuIcon icon={LogOut} danger />}
          title={<span className="text-destructive">{t("more.signOut.label")}</span>}
          subtitle={t("more.signOut.subtitle")}
        />
      </ListCard>

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title={t("more.signOut.confirmTitle")}
        description={t("more.signOut.confirmMessage")}
        confirmLabel={t("more.signOut.confirm")}
        destructive
        pending={signingOut}
        onConfirm={() => {
          setSigningOut(true);
          void logout();
        }}
      />
    </Page>
  );
}

function MenuIcon({ icon: Icon, danger = false }: { icon: LucideIcon; danger?: boolean }) {
  return (
    <span
      className={
        danger
          ? "flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
          : "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
      }
    >
      <Icon className="size-4" />
    </span>
  );
}

function MenuRow({ to, icon, label, subtitle, badge }: { to: string; icon: LucideIcon; label: string; subtitle: string; badge?: ReactNode }) {
  return (
    <RowLink
      to={to}
      leading={<MenuIcon icon={icon} />}
      title={label}
      subtitle={subtitle}
      trailing={
        <span className="flex shrink-0 items-center gap-2">
          {badge ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground tabular-nums">{badge}</span>
          ) : null}
          <ChevronRight className="size-4 text-muted-foreground" />
        </span>
      }
    />
  );
}
