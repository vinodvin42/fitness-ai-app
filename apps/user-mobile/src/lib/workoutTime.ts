import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReminders } from "../api/reminders";
import { formatTimeOfDay } from "./format";

/**
 * The member's own workout reminder time for today ("6:00 PM"), or null when
 * none is set for today. Plan workouts carry no clock time (see
 * ScheduleScreen), so this is the only honest time to show next to today's
 * workout (Figma today/01 "Your next action · 6:00 PM", train/01).
 */
export function useTodayWorkoutTime(): string | null {
  const { data } = useQuery({ queryKey: ["reminders"], queryFn: fetchReminders, staleTime: 60_000 });
  return useMemo(() => {
    const day = new Date().getDay();
    const r = (data ?? [])
      .filter((x) => x.isEnabled && x.category === "workout" && x.daysOfWeek.includes(day))
      .sort((p, q) => p.hour * 60 + p.minute - (q.hour * 60 + q.minute))[0];
    if (!r) return null;
    const d = new Date();
    d.setHours(r.hour, r.minute, 0, 0);
    return formatTimeOfDay(d);
  }, [data]);
}
