import React, { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { CoachScheduleItem } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchMySchedule } from "../../api/coaching";
import { colors, spacing, typography } from "../../theme/tokens";

const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, tomorrow)) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function groupByDay(items: CoachScheduleItem[]): Array<{ label: string; items: CoachScheduleItem[] }> {
  const groups: Array<{ label: string; items: CoachScheduleItem[] }> = [];
  for (const item of items) {
    const label = dayLabel(item.scheduledAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

function SessionRow({ item }: { item: CoachScheduleItem }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>{item.clientFullName}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {item.offeringLabel}
          {item.serviceType ? ` · ${SERVICE_LABELS[item.serviceType] ?? item.serviceType}` : ""} · {item.durationMinutes} min
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: colors.textPrimary }}>{timeLabel(item.scheduledAt)}</Text>
        {item.status === "cancelled" ? (
          <Text style={{ color: colors.danger, fontSize: 11, marginTop: 2 }}>Cancelled</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Calendar (docs/coach/02-information-architecture.md §2: "Calendar has no
 * frames in this file" — one of the three tabs this build has always
 * honestly rendered as "Coming soon" rather than inventing a design for).
 * **26 Aug 2026: real, scoped as a sectioned Booking list, not a
 * month-grid calendar widget** — see apps/api's coaching.service.ts
 * `listMySchedule` doc comment for the full reasoning. Upcoming groups by
 * day (Today/Tomorrow/date); Past shows the most recent bookings
 * (including cancellations, so a coach can see their own history) with an
 * honest "showing most recent N" note when the real total is larger.
 */
export function CalendarScreen() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["coach-schedule"], queryFn: fetchMySchedule });
  const [showPast, setShowPast] = useState(false);

  const upcomingGroups = data ? groupByDay(data.upcoming) : [];
  const pastGroups = data ? groupByDay(data.past) : [];

  return (
    <ScreenContainer title="Calendar">
      {isLoading && <Text style={{ color: colors.textSecondary }}>Loading…</Text>}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && (
        <>
          {upcomingGroups.length === 0 ? (
            <EmptyState title="No upcoming sessions" subtitle="Confirmed bookings will show up here." />
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Upcoming</Text>
              {upcomingGroups.map((group) => (
                <Card key={group.label}>
                  <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.xs }}>
                    {group.label}
                  </Text>
                  {group.items.map((item, i) => (
                    <View
                      key={item.id}
                      style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.xs } : undefined}
                    >
                      <SessionRow item={item} />
                    </View>
                  ))}
                </Card>
              ))}
            </View>
          )}

          <Text
            onPress={() => setShowPast((s) => !s)}
            style={{ color: colors.accent, marginTop: spacing.lg, fontWeight: "600" }}
          >
            {showPast ? "Hide past sessions" : "Show past sessions"}
          </Text>

          {showPast && (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {pastGroups.length === 0 ? (
                <EmptyState title="No past sessions yet" />
              ) : (
                <>
                  {pastGroups.map((group) => (
                    <Card key={group.label}>
                      <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.xs }}>
                        {group.label}
                      </Text>
                      {group.items.map((item, i) => (
                        <View
                          key={item.id}
                          style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.xs } : undefined}
                        >
                          <SessionRow item={item} />
                        </View>
                      ))}
                    </Card>
                  ))}
                  {data.pastTruncated ? (
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>Showing the most recent 50 past sessions.</Text>
                  ) : null}
                </>
              )}
            </View>
          )}
        </>
      )}
    </ScreenContainer>
  );
}
