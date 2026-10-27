import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";
import type { CoachClientProfile, CoachScheduleItem } from "@fitness-ai-app/types";
import { EmptyState, ListCard, Section } from "@/components/page";
import { dateLabel, SERVICE_SHORT, timeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SessionSummaryLink, canWriteSummary } from "./SessionSummaryDialog";
import { canProposeTime, ProposalPending, ProposeTimeButton, ProposeTimeDialog } from "@/screens/calendar/ProposeTime";

/** Upcoming and recent sessions; a past session that went ahead can get a summary. */
export function SessionsTab({ profile, onWriteSummary }: { profile: CoachClientProfile; onWriteSummary: (item: CoachScheduleItem) => void }) {
  const { t } = useTranslation();
  const { upcoming, past, pastTruncated, totalCompleted } = profile.sessions;
  // The profile's rows leave the client's name blank (it's this page's client), so the dialog gets it here.
  const [proposeSession, setProposeSession] = useState<CoachScheduleItem | null>(null);

  return (
    <div className="space-y-6">
      <Section title={t("web.clientProfile.upcoming")}>
        {upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title={t("clients.profile.noneScheduled")} className="py-8" />
        ) : (
          <ListCard>
            {upcoming.map((item) => (
              <SessionRow
                key={item.id}
                item={item}
                onPropose={canProposeTime(item) ? () => setProposeSession({ ...item, clientFullName: profile.fullName }) : undefined}
              />
            ))}
          </ListCard>
        )}
      </Section>

      <Section
        title={t("web.clientProfile.recent")}
        actions={<span className="text-sm text-muted-foreground tabular-nums">{t("web.clientProfile.completedCount", { count: totalCompleted })}</span>}
      >
        {past.length === 0 ? (
          <EmptyState title={t("web.clientProfile.noRecent")} className="py-8" />
        ) : (
          <ListCard>
            {past.map((item) => (
              <SessionRow key={item.id} item={item} onWriteSummary={canWriteSummary(item) ? () => onWriteSummary(item) : undefined} />
            ))}
          </ListCard>
        )}
        {pastTruncated ? <p className="text-xs text-muted-foreground">{t("clients.profile.recentLimit")}</p> : null}
      </Section>
      <ProposeTimeDialog session={proposeSession} onClose={() => setProposeSession(null)} />
    </div>
  );
}

function SessionRow({ item, onWriteSummary, onPropose }: { item: CoachScheduleItem; onWriteSummary?: () => void; onPropose?: () => void }) {
  const { t } = useTranslation();
  const cancelled = item.status === "cancelled";
  const svc = item.serviceType ? (SERVICE_SHORT[item.serviceType] ?? item.serviceType) : null;
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="w-16 shrink-0 text-center">
          <div className="text-xs font-medium text-muted-foreground uppercase">{dateLabel(item.scheduledAt, { month: "short" })}</div>
          <div className="font-heading text-xl leading-tight font-bold tabular-nums">{dateLabel(item.scheduledAt, { day: "numeric" })}</div>
        </div>
        <div className={cn("grid min-w-0 flex-1 gap-0.5", cancelled && "text-muted-foreground")}>
          <span className={cn("truncate font-medium", cancelled && "line-through")}>{item.offeringLabel}</span>
          <span className="truncate text-sm text-muted-foreground tabular-nums">
            {timeLabel(item.scheduledAt)} · {item.durationMinutes} min{svc ? ` · ${svc}` : ""}
          </span>
        </div>
        {cancelled ? (
          <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-[11px] font-semibold text-muted-foreground">
            {item.cancelledBy === "member" ? t("web.comms.cancelledByClient") : t("web.clientProfile.cancelled")}
          </span>
        ) : null}
      </div>
      {onWriteSummary || onPropose || (!cancelled && item.proposedScheduledAt) ? (
        <div className="flex flex-wrap items-center gap-2 pl-19 sm:pl-0">
          {!cancelled && item.proposedScheduledAt ? <ProposalPending item={item} /> : null}
          {onPropose ? <ProposeTimeButton onPress={onPropose} /> : null}
          {onWriteSummary ? <SessionSummaryLink item={item} onClick={onWriteSummary} /> : null}
        </div>
      ) : null}
    </div>
  );
}
