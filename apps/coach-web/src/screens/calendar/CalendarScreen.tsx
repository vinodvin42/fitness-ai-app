import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, History, Loader2, PenLine } from "lucide-react";
import type { BookingSummary, CoachScheduleItem } from "@fitness-ai-app/types";
import { fetchMySchedule } from "@/api/coaching";
import { fetchBookingSummary, publishBookingSummary } from "@/api/bookingSummaries";
import { EmptyState, ErrorState, ListCard, ListSkeleton, Page, PageHeader } from "@/components/page";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/lib/apiError";
import { dateTimeLabel, dayHeading, SERVICE_SHORT, timeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { canProposeTime, ProposalPending, ProposeTimeButton, ProposeTimeDialog } from "./ProposeTime";

type DayGroup = { label: string; items: CoachScheduleItem[] };

/** Consecutive items on the same day share a heading; the API already sorts them. */
function groupByDay(items: CoachScheduleItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const label = dayHeading(item.scheduledAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/**
 * Calendar, ported from apps/coach-mobile's CalendarScreen: a sectioned list
 * of bookings (GET /professionals/me/schedule), not a month grid. Upcoming
 * groups by day; Past shows the most recent bookings, cancellations included,
 * with the "most recent N" note when the API capped the list. A past session
 * that went ahead can get a session summary, which the client reads in their
 * app.
 */
export function CalendarScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["coach-schedule"], queryFn: fetchMySchedule });
  const [summarySession, setSummarySession] = useState<CoachScheduleItem | null>(null);
  const [proposeSession, setProposeSession] = useState<CoachScheduleItem | null>(null);

  const upcomingGroups = data ? groupByDay(data.upcoming) : [];
  const pastGroups = data ? groupByDay(data.past) : [];

  return (
    <Page>
      <PageHeader title={t("calendar.title")} description={t("web.comms.calendarDescription")} />

      <Tabs defaultValue="upcoming" className="gap-4">
        <TabsList className="h-10 w-full sm:w-fit">
          <TabsTrigger value="upcoming" className="px-4">
            <CalendarDays />
            {t("web.comms.upcoming")}
            {data ? <span className="text-muted-foreground tabular-nums">{data.upcoming.length}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="past" className="px-4">
            <History />
            {t("web.comms.past")}
          </TabsTrigger>
        </TabsList>

        {isLoading ? <ListSkeleton rows={4} /> : null}
        {isError ? <ErrorState onRetry={() => refetch()} /> : null}

        {data ? (
          <>
            <TabsContent value="upcoming" className="space-y-6">
              {upcomingGroups.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title={t("calendar.emptyUpcomingTitle")}
                  description={t("calendar.emptyUpcomingSubtitle")}
                />
              ) : (
                upcomingGroups.map((group) => <DayList key={group.label} group={group} onPropose={setProposeSession} />)
              )}
            </TabsContent>

            <TabsContent value="past" className="space-y-6">
              {pastGroups.length === 0 ? (
                <EmptyState icon={History} title={t("calendar.emptyPast")} />
              ) : (
                <>
                  {pastGroups.map((group) => (
                    <DayList key={group.label} group={group} onWriteSummary={setSummarySession} />
                  ))}
                  {data.pastTruncated ? <p className="text-xs text-muted-foreground">{t("calendar.recentLimit")}</p> : null}
                </>
              )}
            </TabsContent>
          </>
        ) : null}
      </Tabs>

      <SessionSummaryDialog
        session={summarySession}
        clientName={summarySession?.clientFullName ?? ""}
        onClose={() => setSummarySession(null)}
      />
      <ProposeTimeDialog session={proposeSession} onClose={() => setProposeSession(null)} />
    </Page>
  );
}

/** One day's sessions. `onWriteSummary` is passed for Past only, where a summary can be written; `onPropose` for Upcoming. */
function DayList({
  group,
  onWriteSummary,
  onPropose,
}: {
  group: DayGroup;
  onWriteSummary?: (item: CoachScheduleItem) => void;
  onPropose?: (item: CoachScheduleItem) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
      <ListCard>
        {group.items.map((item) => (
          <SessionRow
            key={item.id}
            item={item}
            onWriteSummary={onWriteSummary && canWriteSummary(item) ? () => onWriteSummary(item) : undefined}
            onPropose={onPropose && canProposeTime(item) ? () => onPropose(item) : undefined}
          />
        ))}
      </ListCard>
    </section>
  );
}

export function SessionRow({ item, onWriteSummary, onPropose }: { item: CoachScheduleItem; onWriteSummary?: () => void; onPropose?: () => void }) {
  const { t } = useTranslation();
  const cancelled = item.status === "cancelled";
  const meta = [
    item.offeringLabel,
    item.serviceType ? (SERVICE_SHORT[item.serviceType] ?? item.serviceType) : null,
    t("web.comms.durationMin", { count: item.durationMinutes }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      {/* The client's name opens their profile, as in the old app. */}
      <Link
        to={`/clients/${item.clientId}`}
        state={{ fullName: item.clientFullName }}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className={cn("w-16 shrink-0 text-sm font-semibold tabular-nums", cancelled && "text-muted-foreground line-through")}>
          {timeLabel(item.scheduledAt)}
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate font-medium group-hover:underline">{item.clientFullName}</span>
          <span className="truncate text-sm text-muted-foreground">{meta}</span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2 pl-19 sm:pl-0">
        {cancelled ? (
          <StatusBadge
            status="cancelled"
            label={item.cancelledBy === "member" ? t("web.comms.cancelledByClient") : t("web.comms.cancelled")}
            className="bg-destructive/12 text-destructive"
          />
        ) : null}
        {!cancelled && item.proposedScheduledAt ? <ProposalPending item={item} /> : null}
        {onPropose ? <ProposeTimeButton onPress={onPropose} /> : null}
        {onWriteSummary ? <SessionSummaryLink item={item} onPress={onWriteSummary} /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session summary, ported from apps/coach-mobile/src/components/SessionSummarySheet.tsx.

/** Same cap as apps/api's coachSummaries.schema.ts publishSummarySchema. */
const SUMMARY_MAX_LENGTH = 4000;

const summaryKey = (bookingId: string) => ["coach-booking-summary", bookingId] as const;

/** The API takes a summary only for a confirmed session that has started (coachSummaries.service.ts). */
export function canWriteSummary(item: CoachScheduleItem, now: number = Date.now()): boolean {
  return item.status === "confirmed" && new Date(item.scheduledAt).getTime() <= now;
}

/**
 * "Write summary", or "Summary published" once this coach has published one.
 * The row's hasSummary says so after a reload; the dialog's own read of the
 * summary, if it has run, is newer, so it wins. Reads that cache only.
 */
export function SessionSummaryLink({ item, onPress }: { item: CoachScheduleItem; onPress: () => void }) {
  const { t } = useTranslation();
  const { data: cached } = useQuery({
    queryKey: summaryKey(item.id),
    queryFn: () => fetchBookingSummary(item.id),
    enabled: false,
  });
  const published = cached?.hasSummary ?? item.hasSummary;
  return (
    <Button variant={published ? "ghost" : "outline"} size="sm" onClick={onPress} className={cn("h-9 sm:h-7", published && "text-success")}>
      {published ? <CheckCircle2 /> : <PenLine />}
      {published ? t("sessionSummary.published") : t("sessionSummary.write")}
    </Button>
  );
}

/**
 * Write and publish a session summary. Reads it back from GET
 * /professionals/me/bookings/:id/summary so a published one shows with its
 * time; publishing again replaces it. Errors show inside the dialog.
 */
export function SessionSummaryDialog({
  session,
  clientName,
  onClose,
}: {
  /** The session being summarised; null keeps the dialog closed. */
  session: CoachScheduleItem | null;
  /** Passed separately because Client Profile's schedule rows leave clientFullName empty. */
  clientName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={session != null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sessionSummary.title")}</DialogTitle>
          {session ? (
            <DialogDescription>
              {clientName} · {dateTimeLabel(session.scheduledAt)} · {session.offeringLabel}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {session ? <SummaryBody key={session.id} session={session} clientName={clientName} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SummaryBody({ session, clientName, onClose }: { session: CoachScheduleItem; clientName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: summaryKey(session.id), queryFn: () => fetchBookingSummary(session.id) });

  if (query.data) {
    return (
      <SummaryContent
        session={session}
        clientName={clientName}
        published={query.data.hasSummary ? query.data : null}
        onClose={onClose}
      />
    );
  }
  if (query.isError) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {t("sessionSummary.loadFailed")}: {extractErrorMessage(query.error, t("web.comms.tryAgain"))}
        </p>
        <Button variant="outline" onClick={() => query.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex justify-center py-8" role="status" aria-label={t("sessionSummary.loading")}>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Mounted once the read has answered, so the editor starts open only when nothing is published yet. */
function SummaryContent({
  session,
  clientName,
  published,
  onClose,
}: {
  session: CoachScheduleItem;
  clientName: string;
  published: BookingSummary | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(!published);
  const [draft, setDraft] = useState(published?.summaryText ?? "");
  const firstName = clientName.split(" ")[0] || clientName;

  const mutation = useMutation({
    mutationFn: () => publishBookingSummary(session.id, { summaryText: draft.trim() }),
    onSuccess: (result) => {
      queryClient.setQueryData(summaryKey(session.id), result);
      // Calendar and Client Profile rows carry hasSummary; refresh them so they agree after this.
      void queryClient.invalidateQueries({ queryKey: ["coach-schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["coach-client"] });
      setEditing(false);
    },
  });

  const canPublish = draft.trim().length > 0 && !mutation.isPending;

  if (editing || !published) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canPublish) mutation.mutate();
        }}
      >
        <p className="text-sm text-muted-foreground">{t("sessionSummary.intro", { name: firstName })}</p>
        <div className="space-y-1.5">
          <Label htmlFor="session-summary" className="sr-only">
            {t("sessionSummary.inputLabel")}
          </Label>
          <Textarea
            id="session-summary"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("sessionSummary.placeholder")}
            maxLength={SUMMARY_MAX_LENGTH}
            className="min-h-40 [field-sizing:fixed]"
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {t("web.comms.summaryChars", { count: draft.length, max: SUMMARY_MAX_LENGTH })}
          </p>
        </div>
        {published ? <p className="text-xs text-muted-foreground">{t("sessionSummary.replaceNote", { name: firstName })}</p> : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("sessionSummary.failed")}: {extractErrorMessage(mutation.error, t("web.comms.tryAgain"))}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {published ? (
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={mutation.isPending}>
              {t("common.cancel")}
            </Button>
          ) : null}
          <Button type="submit" disabled={!canPublish}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
            {t("sessionSummary.publish")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      {published.summaryPublishedAt ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4" />
          {t("sessionSummary.publishedAt", { when: dateTimeLabel(published.summaryPublishedAt) })}
        </p>
      ) : null}
      <p className="rounded-lg bg-muted p-3 text-sm leading-relaxed whitespace-pre-wrap">{published.summaryText}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setDraft(published.summaryText ?? "");
            mutation.reset();
            setEditing(true);
          }}
        >
          {t("sessionSummary.edit")}
        </Button>
        <Button onClick={onClose}>{t("sessionSummary.done")}</Button>
      </div>
    </div>
  );
}
