import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bell,
  CalendarPlus,
  CheckCheck,
  Gift,
  IndianRupee,
  Loader2,
  MessageSquare,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { ProfessionalNotificationItem, ProfessionalNotificationKind } from "@fitness-ai-app/types";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/api/professionalNotifications";
import { EmptyState, ListCard, ListSkeleton, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { coachNotificationsKey, useCoachNotifications } from "@/lib/coachAlerts";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONS: Record<ProfessionalNotificationKind, LucideIcon> = {
  request: UserPlus,
  offer: Gift,
  booking: CalendarPlus,
  message: MessageSquare,
  relationship: UserMinus,
  verification: BadgeCheck,
  payout: IndianRupee,
  system: Bell,
};

/**
 * The coach inbox feed (26 Oct 2026): every notice the API wrote for this
 * coach, newest first. Opening one marks it read and goes to its link.
 */
export function ActivityFeed() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const first = useCoachNotifications();
  const [older, setOlder] = useState<ProfessionalNotificationItem[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const items = [...(first.data?.items ?? []), ...older];
  const cursor = nextBefore === undefined ? first.data?.nextBefore : nextBefore;
  const unread = items.filter((i) => !i.readAt).length;

  const refresh = () => {
    setOlder([]);
    setNextBefore(undefined);
    return queryClient.invalidateQueries({ queryKey: coachNotificationsKey });
  };
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refresh });

  const open = async (item: ProfessionalNotificationItem) => {
    if (!item.readAt) {
      void markNotificationRead(item.id).then(refresh).catch(() => undefined);
    }
    if (item.link) navigate(item.link);
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchNotifications(cursor);
      setOlder((o) => [...o, ...page.items]);
      setNextBefore(page.nextBefore);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Section
      title={t("web.comms.activityTitle")}
      description={t("web.comms.activityHint")}
      actions={
        unread > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
            {readAll.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
            {t("web.comms.markAllRead")}
          </Button>
        ) : null
      }
    >
      {first.isLoading ? <ListSkeleton rows={3} /> : null}
      {first.data && items.length === 0 ? <EmptyState icon={Bell} title={t("web.comms.noActivity")} /> : null}
      {items.length > 0 ? (
        <ListCard>
          {items.map((item) => {
            const Icon = ICONS[item.kind] ?? Bell;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void open(item)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                  !item.readAt && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                    item.readAt ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary-ink",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className={cn("text-sm", item.readAt ? "font-medium" : "font-semibold")}>{item.title}</span>
                  <span className="line-clamp-2 text-sm text-muted-foreground">{item.body}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
                </span>
                {!item.readAt ? (
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label={t("web.comms.unreadDot")} />
                ) : null}
              </button>
            );
          })}
        </ListCard>
      ) : null}
      {cursor ? (
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? <Loader2 className="animate-spin" /> : null}
          {t("web.comms.loadMore")}
        </Button>
      ) : null}
    </Section>
  );
}
