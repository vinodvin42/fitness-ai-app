import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell, HeartPulse, Ruler, ShieldOff, Utensils, type LucideIcon } from "lucide-react";
import { fetchClientSummary } from "@/api/professionalClients";
import { ErrorState, ListSkeleton } from "@/components/page";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateLabel } from "@/lib/format";
import { WithheldNote } from "./OverviewTab";

const shortDate = (iso: string) => dateLabel(iso, { month: "short", day: "numeric", year: "numeric" });

/**
 * Client 360 (Wave 2): training, nutrition, check-ins and body measurements
 * from GET /professionals/me/clients/:userId/summary. Gated server-side on
 * the client's own health_data_processing consent; without it this says so
 * plainly instead of looking empty or broken.
 */
export function ActivityTab({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data: summary, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-client-summary", userId],
    queryFn: () => fetchClientSummary(userId),
  });

  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError) return <ErrorState onRetry={() => refetch()} message={t("clients.profile.activityError")} />;
  if (!summary) return null;

  if (!summary.consentGranted) {
    return (
      <div className="flex gap-3 rounded-xl border border-dashed p-5">
        <ShieldOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">{t("clients.profile.activity")}</p>
          <p className="text-sm text-muted-foreground">{t("web.clientProfile.noConsent")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <ActivityCard
          icon={Dumbbell}
          title={t("web.clientProfile.training")}
          description={t("web.clientProfile.trainingCount", {
            completed: summary.training.completedCount,
            total: summary.training.totalCount,
          })}
          empty={summary.training.recentSessions.length === 0 ? t("clients.profile.noWorkouts") : null}
        >
          {summary.training.recentSessions.map((s) => (
            <Row
              key={s.id}
              primary={s.workoutName ?? t("web.clientProfile.workout")}
              secondary={
                <span className="flex items-center gap-2">
                  <StatusBadge status={s.status} label={s.status.replace(/_/g, " ")} />
                  {shortDate(s.startedAt)}
                </span>
              }
            />
          ))}
        </ActivityCard>

        <ActivityCard
          icon={Utensils}
          title={t("web.clientProfile.nutrition")}
          empty={summary.nutrition.recentLogs.length === 0 ? t("clients.profile.noMeals") : null}
        >
          {summary.nutrition.recentLogs.map((m) => (
            <Row
              key={m.id}
              primary={<span className="capitalize">{t("web.clientProfile.mealLine", { meal: m.mealType, calories: m.calories })}</span>}
              secondary={shortDate(m.loggedAt)}
            />
          ))}
        </ActivityCard>

        <ActivityCard
          icon={HeartPulse}
          title={t("web.clientProfile.checkIns")}
          empty={summary.checkIns.length === 0 ? t("clients.profile.noCheckIns") : null}
        >
          {summary.checkIns.map((c) => (
            <Row
              key={c.id}
              primary={t("web.clientProfile.checkInLine", { energy: c.energy, soreness: c.soreness, adherence: c.adherence })}
              secondary={shortDate(c.createdAt)}
            />
          ))}
        </ActivityCard>

        <ActivityCard
          icon={Ruler}
          title={t("clients.profile.measurements")}
          empty={summary.bodyMeasurements.length === 0 ? t("clients.profile.noMeasurements") : null}
        >
          {summary.bodyMeasurements.map((b) => (
            <Row
              key={b.id}
              primary={b.weightKg != null ? t("web.clientProfile.weightKg", { value: b.weightKg }) : t("web.clientProfile.weightNotSet")}
              secondary={shortDate(b.loggedAt)}
            />
          ))}
        </ActivityCard>
      </div>

      {summary.notAvailable.length > 0 ? <WithheldNote text={t("clients.profile.mediaWithheld")} /> : null}
    </div>
  );
}

function ActivityCard({
  icon: Icon,
  title,
  description,
  empty,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        {description ? <CardDescription className="tabular-nums">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{empty ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="divide-y">{children}</ul>}</CardContent>
    </Card>
  );
}

function Row({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
      <span className="min-w-0 truncate tabular-nums">{primary}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{secondary}</span>
    </li>
  );
}
