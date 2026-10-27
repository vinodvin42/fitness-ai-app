import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, ChevronRight, Lock, Sparkles, Star } from "lucide-react";
import type { CoachClientProfile } from "@fitness-ai-app/types";
import { RATING_TAG_LABEL, fetchMyRatings } from "@/api/sessionRatings";
import { StatCard } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEVEL_KEYS: Record<string, string> = {
  beginner: "web.clientProfile.levelBeginner",
  intermediate: "web.clientProfile.levelIntermediate",
  advanced: "web.clientProfile.levelAdvanced",
};

/** Coaching profile, session counts, the recommendations link and session feedback. */
export function OverviewTab({ profile }: { profile: CoachClientProfile }) {
  const { t } = useTranslation();
  const level = profile.coaching.trainingLevel;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label={t("web.clientProfile.statCompleted")} value={profile.sessions.totalCompleted} icon={CalendarCheck} />
        <StatCard label={t("web.clientProfile.statUpcoming")} value={profile.sessions.upcoming.length} icon={CalendarClock} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("clients.profile.coachingProfile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            <ProfileRow
              label={t("clients.profile.goals")}
              value={profile.coaching.goals.length ? profile.coaching.goals.join(", ") : t("common.notSet")}
            />
            <ProfileRow
              label={t("clients.profile.trainingLevel")}
              value={level ? (LEVEL_KEYS[level] ? t(LEVEL_KEYS[level]) : level) : t("common.notSet")}
            />
            <ProfileRow label={t("clients.profile.diet")} value={profile.coaching.dietType ?? t("common.notSet")} />
          </dl>
        </CardContent>
      </Card>

      <Link
        to={`/clients/${profile.userId}/recommendations`}
        state={{ fullName: profile.fullName }}
        className="group flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
          <Sparkles className="size-4" />
        </span>
        <span className="grid flex-1 gap-0.5">
          <span className="text-sm font-medium">{t("clients.recommendations.review")}</span>
          <span className="text-sm text-muted-foreground">{t("web.clientProfile.recommendationsHint")}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>

      <FeedbackCard userId={profile.userId} />

      {profile.notAvailable.length > 0 ? <WithheldNote text={t("clients.profile.healthWithheld")} /> : null}
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/** A dashed note that something is deliberately withheld from coaches. */
export function WithheldNote({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3 rounded-xl border border-dashed p-4">
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("clients.profile.notAvailable")}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

/**
 * Session feedback (24 Oct 2026): this client's private ratings of their
 * sessions with you (stars, what went well, comment). Only you see them.
 * Hidden when there are none, as in the old app.
 */
function FeedbackCard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["coach-client-ratings", userId], queryFn: () => fetchMyRatings(userId) });
  if (!data || data.count === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("web.clientProfile.feedbackTitle")}</CardTitle>
        <CardDescription>{t("web.clientProfile.feedbackSummary", { average: data.average, count: data.count })}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {data.items.map((r) => (
            <li key={r.bookingId} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <Stars count={r.stars} />
                <span className="text-xs text-muted-foreground">{dateLabel(r.scheduledAt, { day: "numeric", month: "short" })}</span>
              </div>
              {r.tags.length > 0 ? (
                <p className="text-xs text-muted-foreground">{r.tags.map((tag) => RATING_TAG_LABEL[tag] ?? tag).join(" · ")}</p>
              ) : null}
              {r.comment ? <p className="text-sm">“{r.comment}”</p> : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Stars({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={t("web.clientProfile.starsLabel", { count })}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("size-3.5", i < count ? "fill-warning text-warning" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}
