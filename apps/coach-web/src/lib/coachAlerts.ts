import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CoachAlertsResponse } from "@fitness-ai-app/types";
import { fetchCoachAlerts } from "@/api/professionalAlerts";
import { fetchConversations } from "@/api/coachMessages";
import { fetchFormReviews } from "@/api/formReviews";
import { fetchNotifications } from "@/api/professionalNotifications";
import { useAuth } from "@/lib/auth";

/** Clips waiting for this coach's review, shared with the Form reviews list's query. */
export function useFormReviewsToDo(): number {
  const { data } = useQuery({ queryKey: ["coach-form-reviews"], queryFn: fetchFormReviews });
  return (data ?? []).filter((r) => r.status === "queued").length;
}

/**
 * Alerts badge, ported from apps/coach-mobile/src/lib/coachAlerts.ts. Polled,
 * not pushed. Only the shell passes `poll`, so there is one timer.
 *
 * "Bookings seen up to" is the server's `asOf` from the last time the coach
 * opened the inbox, kept in this browser per coach (same key as the old web
 * build, so nothing resets after the switch).
 */
const POLL_MS = 60_000;
const seenKey = (professionalId: string) => `fynroxcoach.alertsSeenAt.${professionalId}`;

function readSeen(id: string): string | null {
  try {
    return localStorage.getItem(seenKey(id));
  } catch {
    return null;
  }
}
function writeSeen(id: string, asOf: string) {
  try {
    localStorage.setItem(seenKey(id), asOf);
  } catch {
    // Storage blocked: bookings count as new again next visit.
  }
}

export const coachAlertsKey = (professionalId: string | undefined) => ["coach-alerts", professionalId] as const;

export function useCoachAlerts({ poll = false }: { poll?: boolean } = {}) {
  const { professional } = useAuth();
  const professionalId = professional?.id;
  return useQuery({
    queryKey: coachAlertsKey(professionalId),
    queryFn: async (): Promise<CoachAlertsResponse> => {
      const id = professionalId as string;
      const seen = readSeen(id);
      const alerts = await fetchCoachAlerts(seen);
      if (!seen) writeSeen(id, alerts.asOf);
      return alerts;
    },
    enabled: !!professionalId,
    refetchInterval: poll ? POLL_MS : undefined,
  });
}

/** Called while the inbox is open: the bookings it lists stop counting as new. */
export function useMarkBookingsSeen() {
  const queryClient = useQueryClient();
  const { professional } = useAuth();
  const professionalId = professional?.id;
  return useCallback(
    async (asOf: string) => {
      if (!professionalId) return;
      const key = coachAlertsKey(professionalId);
      await queryClient.cancelQueries({ queryKey: key });
      writeSeen(professionalId, asOf);
      queryClient.setQueryData<CoachAlertsResponse>(key, (current) =>
        current ? { ...current, newBookings: [], newBookingCount: 0 } : current,
      );
    },
    [queryClient, professionalId],
  );
}

/** Unread client messages across conversations, shared with the Messages list's query. */
export function useUnreadMessageCount({ poll = false }: { poll?: boolean } = {}): number {
  const { data } = useQuery({
    queryKey: ["coach-conversations"],
    queryFn: fetchConversations,
    refetchInterval: poll ? 30_000 : undefined,
  });
  return data ? data.conversations.reduce((sum, c) => sum + c.unreadCount, 0) : 0;
}

/**
 * Notice kinds the other counts don't already cover. A request, offer, booking
 * or message notice is counted once, by the counts above; these are the ones
 * that would otherwise never badge (a verification decision, a payout).
 */
const BADGED_NOTICE_KINDS = new Set(["verification", "payout", "relationship", "system"]);

export const coachNotificationsKey = ["coach-notifications"] as const;

/** The first page of the coach inbox feed, shared with the Inbox screen. */
export function useCoachNotifications({ poll = false }: { poll?: boolean } = {}) {
  return useQuery({ queryKey: coachNotificationsKey, queryFn: () => fetchNotifications(), refetchInterval: poll ? POLL_MS : undefined });
}

/** Everything the shell badges, in one place. */
export function useShellCounts({ poll = false }: { poll?: boolean } = {}) {
  const alerts = useCoachAlerts({ poll }).data;
  const unread = useUnreadMessageCount({ poll });
  const notices = useCoachNotifications({ poll }).data;
  const unreadNotices = (notices?.items ?? []).filter((n) => !n.readAt && BADGED_NOTICE_KINDS.has(n.kind)).length;
  const waiting = alerts ? alerts.pendingRequests + alerts.openOffers : 0;
  const inbox = waiting + (alerts?.newBookingCount ?? 0) + unread + unreadNotices;
  return { waiting, unread, inbox, alerts };
}
