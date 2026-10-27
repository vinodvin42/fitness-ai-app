import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronLeft, Flag, Loader2, MoreHorizontal, SendHorizontal, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { CoachMessageItem, SafetyReportReason } from "@fitness-ai-app/types";
import { fetchThread, reportClient, sendMessage, setClientBlocked } from "@/api/coachMessages";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/page";
import { initials } from "@/components/shell/AccountMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/lib/apiError";
import { dayHeading, timeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportDialog } from "./ReportDialog";

/**
 * Message thread, coach side, ported from apps/coach-mobile's ThreadScreen.
 * The coach IS the "professional" sender, so their own messages align right.
 * Polls every 8s. Each read marks the client's messages read server-side, so
 * the conversation list is refreshed whenever a read brings in a newer
 * message.
 *
 * Safety: the "⋯" menu reports or blocks the client, and the flag beside one
 * of the client's messages reports that message. While either side has
 * blocked, the composer is replaced by a short explanation. Messages Fynrox
 * removed after a report arrive as "Removed by Fynrox".
 */
export function ThreadPane({ userId, fallbackName }: { userId: string; fallbackName: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState<{ messageId?: string } | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coach-thread", userId],
    queryFn: () => fetchThread(userId),
    refetchInterval: 8_000,
  });

  const fullName = data?.partnerName || fallbackName;
  const firstName = fullName.split(" ")[0] ?? fullName;

  // Each thread read marks the client's messages read, so refresh the
  // conversation list (and the Messages badge) whenever a read brings in a
  // newest message the badge may still be counting.
  const newestMessageId = data?.messages[data.messages.length - 1]?.id;
  useEffect(() => {
    if (newestMessageId) void queryClient.invalidateQueries({ queryKey: ["coach-conversations"] });
  }, [newestMessageId, queryClient]);

  // Open on the newest message, and follow new ones as they arrive.
  const hasData = data != null;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestMessageId, hasData]);

  const mutation = useMutation({
    mutationFn: () => sendMessage(userId, { content: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["coach-thread", userId] });
      void queryClient.invalidateQueries({ queryKey: ["coach-conversations"] });
    },
    onError: (err) => toast.error(t("web.comms.sendFailed"), { description: extractErrorMessage(err, t("web.comms.tryAgain")) }),
  });

  const canSend = draft.trim().length > 0 && !mutation.isPending;
  const blocked = data?.blocked;
  const isBlocked = Boolean(blocked?.byMe || blocked?.byThem);

  const reportMutation = useMutation({
    mutationFn: (input: { reason: SafetyReportReason; details: string; messageId?: string }) =>
      reportClient(userId, { reason: input.reason, details: input.details || undefined, messageId: input.messageId }),
    onSuccess: () => {
      setReporting(null);
      toast.success(t("web.comms.reportSent"), { description: t("web.comms.reportSentBody") });
    },
    onError: (err) => toast.error(t("web.comms.reportFailed"), { description: extractErrorMessage(err, t("web.comms.tryAgain")) }),
  });

  const blockMutation = useMutation({
    mutationFn: (block: boolean) => setClientBlocked(userId, block),
    onSuccess: () => {
      setConfirmBlock(false);
      void queryClient.invalidateQueries({ queryKey: ["coach-thread", userId] });
    },
    onError: (err) => toast.error(t("web.comms.actionFailed"), { description: extractErrorMessage(err, t("web.comms.tryAgain")) }),
  });

  const onMenuBlock = () => {
    if (blocked?.byMe) blockMutation.mutate(false);
    else setConfirmBlock(true);
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a new line. Leave Enter alone while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) mutation.mutate();
    }
  };

  return (
    <>
      {/* Header: back (phone), who, View profile, and the safety menu. */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-2 md:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={t("web.comms.backToMessages")}
          render={<Link to="/messages" />}
        >
          <ChevronLeft />
        </Button>
        <Avatar>
          <AvatarFallback className="text-xs font-medium">{initials(fullName)}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 leading-tight">
          {fullName ? <span className="truncate font-semibold">{fullName}</span> : <Skeleton className="h-4 w-32" />}
          {/* Thread ↔ client profile, both ways. */}
          <Link
            to={`/clients/${userId}`}
            state={{ fullName }}
            className="w-fit text-xs font-medium text-primary-ink hover:underline"
          >
            {t("messages.viewProfile")}
          </Link>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={t("web.comms.moreOptions", { name: fullName })} />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setReporting({})}>
              <Flag />
              {t("web.comms.reportName", { name: firstName })}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant={blocked?.byMe ? "default" : "destructive"}
              onClick={onMenuBlock}
              disabled={!data || blockMutation.isPending}
            >
              {blocked?.byMe ? <ShieldCheck /> : <Ban />}
              {blocked?.byMe ? t("web.comms.unblock") : t("web.comms.block")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-2 px-3 py-4 md:px-6">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label={t("web.loading")}>
              <Skeleton className="h-12 w-2/3 rounded-2xl" />
              <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
              <Skeleton className="h-16 w-3/5 rounded-2xl" />
            </div>
          ) : null}
          {isError ? <ErrorState onRetry={() => refetch()} /> : null}
          {data && data.messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("web.comms.sayHello", { name: firstName })}</p>
          ) : null}
          {data?.messages.map((m, i) => {
            const prev = data.messages[i - 1];
            const day = dayHeading(m.createdAt);
            const showDay = !prev || dayHeading(prev.createdAt) !== day;
            return (
              <div key={m.id} className="contents">
                {showDay ? (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{day}</span>
                  </div>
                ) : null}
                <MessageBubble
                  message={m}
                  mine={m.sender === "professional"}
                  onReport={() => setReporting({ messageId: m.id })}
                  reportLabel={t("web.comms.reportMessage")}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Composer, or why it's off */}
      {isBlocked ? (
        <div className="shrink-0 space-y-1 border-t px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            {blocked?.byMe ? t("web.comms.blockedByMe", { name: firstName }) : t("web.comms.blockedOff")}
          </p>
          {blocked?.byMe ? (
            <Button variant="link" className="h-auto px-0 text-primary-ink" onClick={() => blockMutation.mutate(false)} disabled={blockMutation.isPending}>
              {blockMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("web.comms.unblock")}
            </Button>
          ) : null}
        </div>
      ) : (
        <form
          className="shrink-0 border-t bg-background px-3 py-3 md:px-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) mutation.mutate();
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={t("messages.placeholder")}
              aria-label={t("web.comms.messageLabel", { name: firstName })}
              aria-describedby="composer-hint"
              rows={1}
              disabled={!data}
              className="max-h-32 min-h-10 resize-none py-2"
            />
            <Button type="submit" size="icon-lg" className="size-10 shrink-0" disabled={!canSend} aria-label={t("common.send")}>
              {mutation.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            </Button>
          </div>
          <p id="composer-hint" className="mx-auto mt-1 hidden w-full max-w-3xl text-[11px] text-muted-foreground md:block">
            {t("web.comms.composerHint")}
          </p>
        </form>
      )}

      <ReportDialog
        open={reporting !== null}
        subject={reporting?.messageId ? t("web.comms.thisMessage") : firstName}
        submitting={reportMutation.isPending}
        onClose={() => setReporting(null)}
        onSubmit={(reason, details) => reportMutation.mutate({ reason, details, messageId: reporting?.messageId })}
      />

      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={t("web.comms.blockTitle", { name: firstName })}
        description={t("web.comms.blockBody")}
        confirmLabel={t("web.comms.block")}
        destructive
        pending={blockMutation.isPending}
        onConfirm={() => blockMutation.mutate(true)}
      />
    </>
  );
}

function MessageBubble({
  message,
  mine,
  onReport,
  reportLabel,
}: {
  message: CoachMessageItem;
  mine: boolean;
  onReport: () => void;
  reportLabel: string;
}) {
  // Only the client's own, still-visible messages can be reported.
  const reportable = !mine && !message.removed;
  return (
    <div className={cn("group flex items-center gap-1", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm md:max-w-[70%]",
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        <p className={cn("break-words whitespace-pre-wrap", message.removed && "text-muted-foreground italic")}>{message.content}</p>
        <p className={cn("mt-0.5 text-right text-[10px] tabular-nums", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
          {timeLabel(message.createdAt)}
        </p>
      </div>
      {reportable ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onReport}
          aria-label={reportLabel}
          title={reportLabel}
          className="shrink-0 text-muted-foreground opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          <Flag />
        </Button>
      ) : null}
    </div>
  );
}
