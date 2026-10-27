import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Loader2, PenLine } from "lucide-react";
import type { BookingSummary, CoachScheduleItem } from "@fitness-ai-app/types";
import { fetchBookingSummary, publishBookingSummary } from "@/api/bookingSummaries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";

/** Same cap as apps/api's coachSummaries.schema.ts publishSummarySchema. */
const SUMMARY_MAX_LENGTH = 4000;

const summaryKey = (bookingId: string) => ["coach-booking-summary", bookingId] as const;

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The API takes a summary only for a confirmed session that has started (coachSummaries.service.ts). */
export function canWriteSummary(item: CoachScheduleItem, now: number = Date.now()): boolean {
  return item.status === "confirmed" && new Date(item.scheduledAt).getTime() <= now;
}

/**
 * "Write summary" on a past session, or "Summary published" once this coach
 * has published one. The row's hasSummary says so after a reload; the
 * dialog's own read of the summary, if it has run, is newer, so it wins. The
 * link only reads that cache and never fetches.
 */
export function SessionSummaryLink({ item, onClick }: { item: CoachScheduleItem; onClick: () => void }) {
  const { t } = useTranslation();
  const { data: cached } = useQuery({
    queryKey: summaryKey(item.id),
    queryFn: () => fetchBookingSummary(item.id),
    enabled: false,
  });
  const published = cached?.hasSummary ?? item.hasSummary;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-medium hover:underline md:min-h-0",
        published ? "text-success" : "text-primary-ink",
      )}
    >
      {published ? <CheckCircle2 className="size-4" /> : <PenLine className="size-4" />}
      {published ? t("sessionSummary.published") : t("sessionSummary.write")}
      {published ? null : <ChevronRight className="size-4" />}
    </button>
  );
}

/** Whether this coach has a summary published for the session, from the freshest source. */
export function useHasSummary(item: CoachScheduleItem | null): boolean {
  const { data: cached } = useQuery({
    queryKey: summaryKey(item?.id ?? ""),
    queryFn: () => fetchBookingSummary(item!.id),
    enabled: false,
  });
  return item ? (cached?.hasSummary ?? item.hasSummary) : false;
}

/**
 * Write and publish a session summary (25 Oct 2026). The old app's bottom
 * sheet, as a dialog. It reads the summary back from GET
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
    <Dialog open={session != null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sessionSummary.title")}</DialogTitle>
          {session ? (
            <DialogDescription>
              {clientName} · {whenLabel(session.scheduledAt)} · {session.offeringLabel}
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
      <SummaryContent session={session} clientName={clientName} published={query.data.hasSummary ? query.data : null} onClose={onClose} />
    );
  }
  if (query.isError) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {t("sessionSummary.loadFailed")}: {extractErrorMessage(query.error, t("web.clientProfile.tryAgain"))}
        </p>
        <Button variant="outline" onClick={() => query.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-label={t("sessionSummary.loading")} className="space-y-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-40 w-full" />
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
          <Label htmlFor="session-summary-text" className="sr-only">
            {t("sessionSummary.inputLabel")}
          </Label>
          <Textarea
            id="session-summary-text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("sessionSummary.placeholder")}
            maxLength={SUMMARY_MAX_LENGTH}
            className="min-h-40"
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {draft.length}/{SUMMARY_MAX_LENGTH}
          </p>
        </div>
        {published ? <p className="text-xs text-muted-foreground">{t("sessionSummary.replaceNote", { name: firstName })}</p> : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("sessionSummary.failed")}: {extractErrorMessage(mutation.error, t("web.clientProfile.tryAgain"))}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {published ? (
            <Button type="button" variant="outline" className="h-10 sm:h-8" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
          ) : null}
          <Button type="submit" className="h-10 sm:h-8" disabled={!canPublish}>
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
        <p className="flex items-center gap-1.5 text-sm font-medium text-success">
          <CheckCircle2 className="size-4" />
          {t("sessionSummary.publishedAt", { when: whenLabel(published.summaryPublishedAt) })}
        </p>
      ) : null}
      <p className="rounded-lg bg-muted p-3 text-sm leading-relaxed whitespace-pre-wrap">{published.summaryText}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          className="h-10 sm:h-8"
          onClick={() => {
            setDraft(published.summaryText ?? "");
            mutation.reset();
            setEditing(true);
          }}
        >
          {t("sessionSummary.edit")}
        </Button>
        <Button className="h-10 sm:h-8" onClick={onClose}>
          {t("sessionSummary.done")}
        </Button>
      </div>
    </div>
  );
}
