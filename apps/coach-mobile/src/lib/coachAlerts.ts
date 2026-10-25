import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CoachAlertsResponse } from "@fitness-ai-app/types";
import { fetchCoachAlerts } from "../api/professionalAlerts";
import { useAuth } from "../context/AuthContext";
import { getItemAsync, setItemAsync } from "./secureStore";

/**
 * The Alerts badge (25 Oct 2026, coach communication audit B2). Polled, not
 * pushed: this build has no push notifications. Only MainTabs passes
 * `poll`, because every mounted screen header renders the badge and each
 * polling subscriber would run its own timer.
 */
const POLL_MS = 60_000;

/**
 * "Bookings seen up to": the server's `asOf` from the last time the coach
 * opened Alerts, kept on this device per coach. Bookings made after it count
 * as new. Kept on the device because there is no professional inbox in the
 * API yet, so a coach with two devices sees a new booking on each.
 */
const seenKey = (professionalId: string) => `fynroxcoach.alertsSeenAt.${professionalId}`;

export const coachAlertsKey = (professionalId: string | undefined) => ["coach-alerts", professionalId] as const;

export function useCoachAlerts({ poll = false }: { poll?: boolean } = {}) {
  const { professional } = useAuth();
  const professionalId = professional?.id;
  return useQuery({
    queryKey: coachAlertsKey(professionalId),
    queryFn: async (): Promise<CoachAlertsResponse> => {
      const id = professionalId as string;
      const seen = await getItemAsync(seenKey(id));
      const alerts = await fetchCoachAlerts(seen);
      // First read on this device: nothing counts as new yet, so start the mark here.
      if (!seen) await setItemAsync(seenKey(id), alerts.asOf);
      return alerts;
    },
    enabled: !!professionalId,
    refetchInterval: poll ? POLL_MS : undefined,
  });
}

/** Called when the coach has the Alerts screen open: the bookings it lists stop counting. */
export function useMarkBookingsSeen() {
  const queryClient = useQueryClient();
  const { professional } = useAuth();
  const professionalId = professional?.id;
  return useCallback(
    async (asOf: string) => {
      if (!professionalId) return;
      const key = coachAlertsKey(professionalId);
      // A poll that started with the old mark would put the old bookings back.
      await queryClient.cancelQueries({ queryKey: key });
      await setItemAsync(seenKey(professionalId), asOf);
      queryClient.setQueryData<CoachAlertsResponse>(key, (current) =>
        current ? { ...current, newBookings: [], newBookingCount: 0 } : current,
      );
    },
    [queryClient, professionalId],
  );
}
