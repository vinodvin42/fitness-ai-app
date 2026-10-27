import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { CoachScheduleItem } from "@fitness-ai-app/types";
import { fetchMyAvailability, proposeNewTime, withdrawProposal } from "@/api/coaching";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { extractErrorMessage } from "@/lib/apiError";
import { dateLabel, dateTimeLabel, timeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Same notice the API requires (bookingChanges.service.ts COACH_PROPOSAL_MIN_NOTICE_MS). */
const MIN_NOTICE_MS = 12 * 60 * 60 * 1000;
const DAYS_AHEAD = 14;

export function canProposeTime(item: CoachScheduleItem, now: number = Date.now()): boolean {
  return item.status === "confirmed" && !item.proposedScheduledAt && new Date(item.scheduledAt).getTime() - now >= MIN_NOTICE_MS;
}

/** Every query that shows a booking's time: the calendar, Today and the client profile. */
function invalidateSchedules(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["coach-schedule"] });
  void queryClient.invalidateQueries({ queryKey: ["coach-client"] });
  void queryClient.invalidateQueries({ queryKey: ["professional-dashboard-stats"] });
}

/** The pending proposal on a session row: the proposed time and a Withdraw button. */
export function ProposalPending({ item }: { item: CoachScheduleItem }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: () => withdrawProposal(item.id),
    onSuccess: () => {
      toast.success(t("web.comms.withdrawn"));
      invalidateSchedules(queryClient);
    },
    onError: (err) => toast.error(extractErrorMessage(err, t("web.comms.tryAgain"))),
  });
  if (!item.proposedScheduledAt) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning" title={t("web.comms.proposedWaiting")}>
        <CalendarClock className="size-3.5" />
        {t("web.comms.proposedPending", { when: dateTimeLabel(item.proposedScheduledAt) })}
      </span>
      <Button variant="ghost" size="sm" className="h-9 sm:h-7" onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>
        {withdraw.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
        {t("web.comms.withdraw")}
      </Button>
    </span>
  );
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Pick a free time on the coach's own grid (next 14 days) and send it to the
 * client. The session stays put until the client answers.
 */
export function ProposeTimeDialog({ session, onClose }: { session: CoachScheduleItem | null; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const days = useMemo(() => {
    const out: string[] = [];
    const start = new Date();
    for (let i = 0; i < DAYS_AHEAD; i++) out.push(isoDay(new Date(start.getTime() + i * 86_400_000)));
    return out;
  }, []);
  const [day, setDay] = useState(days[1] ?? days[0]);
  const [time, setTime] = useState<string | null>(null);

  const slots = useQuery({
    queryKey: ["coach-my-availability", day],
    queryFn: () => fetchMyAvailability(day),
    enabled: !!session,
  });
  const now = Date.now();
  const free = (slots.data?.slots ?? []).filter((s) => s.available && new Date(s.time).getTime() > now && s.time !== session?.scheduledAt);

  const send = useMutation({
    mutationFn: () => proposeNewTime(session!.id, time!),
    onSuccess: () => {
      toast.success(t("web.comms.proposeSent", { name: session!.clientFullName }));
      invalidateSchedules(queryClient);
      close();
    },
    onError: (err) => toast.error(extractErrorMessage(err, t("web.comms.tryAgain"))),
  });

  const close = () => {
    setTime(null);
    onClose();
  };

  const name = session?.clientFullName || "";
  return (
    <Dialog open={!!session} onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("web.comms.proposeTitle")}</DialogTitle>
          {session ? (
            <DialogDescription>{t("web.comms.proposeIntro", { name, when: dateTimeLabel(session.scheduledAt) })}</DialogDescription>
          ) : null}
        </DialogHeader>

        {/* min-w-0: the scrolling day strip must not widen the dialog grid. */}
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label>{t("web.comms.proposePickDay")}</Label>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {days.map((d) => {
                const date = new Date(`${d}T00:00:00Z`);
                const active = d === day;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDay(d);
                      setTime(null);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "flex w-14 shrink-0 flex-col items-center rounded-lg border py-2 text-xs transition-colors",
                      active ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <span>{dateLabel(date.toISOString(), { weekday: "short", timeZone: "UTC" })}</span>
                    <span className="text-base font-semibold text-foreground tabular-nums">{date.getUTCDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("web.comms.proposePickTime")}</Label>
            {slots.isLoading ? (
              <div className="flex h-20 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : free.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("web.comms.proposeNoSlots")}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {free.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    onClick={() => setTime(s.time)}
                    aria-pressed={time === s.time}
                    className={cn(
                      "h-10 rounded-lg border text-sm font-medium tabular-nums transition-colors",
                      time === s.time ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {timeLabel(s.time)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={send.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => send.mutate()} disabled={!time || send.isPending}>
            {send.isPending ? <Loader2 className="animate-spin" /> : <CalendarClock />}
            {t("web.comms.proposeSend", { name })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProposeTimeButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="outline" size="sm" className="h-9 sm:h-7" onClick={onPress}>
      <CalendarClock />
      {t("web.comms.proposeTime")}
    </Button>
  );
}
