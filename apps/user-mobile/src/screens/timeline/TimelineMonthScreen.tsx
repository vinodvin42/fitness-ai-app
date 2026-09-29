import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { TimelineEvent, TimelineEventType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { fetchTimeline } from "../../api/timeline";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "TimelineMonth">;

const BADGE_COLOR: Record<TimelineEventType, string> = {
  pr: colors.warning,
  milestone: colors.accent,
  program_complete: colors.success,
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Timeline Month (docs/mobile/03-screen-inventory.md §G) — a calendar grid
 * for one month with a dot on any day that has a real timeline event.
 * Not built: the design's "coach comment" element — no Coach infra until
 * Phase 5, and there'd be nothing real for a coach to comment on yet
 * anyway. Reuses the same ["timeline"] query as Timeline Overview, so
 * navigating here right after Overview costs no extra network call.
 */
export function TimelineMonthScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(route.params?.year ?? now.getFullYear());
  const [month, setMonth] = useState(route.params?.month ?? now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const { data: events, isLoading, isError, refetch } = useQuery({ queryKey: ["timeline"], queryFn: fetchTimeline });

  const eventsByDay = useMemo(() => {
    const map = new Map<number, TimelineEvent[]>();
    for (const event of events ?? []) {
      const d = new Date(event.occurredAt);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const list = map.get(d.getDate()) ?? [];
      list.push(event);
      map.set(d.getDate(), list);
    }
    return map;
  }, [events, year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: Array<number | null> = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const goToMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
    setSelectedDay(null);
  };

  const selectedDayEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];

  return (
    <ScreenContainer title={t("timeline.title")}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
        <Pressable onPress={() => goToMonth(-1)}>
          <Text style={{ color: colors.accent, ...typography.h2 }}>{"‹"}</Text>
        </Pressable>
        <Text style={{ color: colors.textPrimary, ...typography.h2 }}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <Pressable onPress={() => goToMonth(1)}>
          <Text style={{ color: colors.accent, ...typography.h2 }}>{"›"}</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <Card>
          <View style={{ flexDirection: "row" }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: spacing.xs }}>
            {cells.map((day, i) => {
              const dayEvents = day ? eventsByDay.get(day) ?? [] : [];
              return (
                <Pressable
                  key={i}
                  disabled={!day}
                  onPress={() => day && setSelectedDay(day === selectedDay ? null : day)}
                  style={{ width: "14.28%", alignItems: "center", paddingVertical: spacing.xs }}
                >
                  {day ? (
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: radius.sm,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: day === selectedDay ? colors.accent : "transparent",
                      }}
                    >
                      <Text style={{ color: day === selectedDay ? "#0B0B0F" : colors.textPrimary }}>{day}</Text>
                      {dayEvents.length > 0 ? (
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 2.5,
                            marginTop: 2,
                            backgroundColor: day === selectedDay ? "#0B0B0F" : BADGE_COLOR[dayEvents[0].type],
                          }}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      {selectedDay ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {selectedDayEvents.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>No events on {MONTH_NAMES[month]} {selectedDay}.</Text>
          ) : (
            selectedDayEvents.map((event) => (
              <Pressable key={event.id} onPress={() => navigation.navigate("TimelineEvent", { event })}>
                <Card>
                  <Text style={{ color: colors.textPrimary, ...typography.h2 }}>{event.title}</Text>
                  <Text style={{ color: colors.textSecondary, marginTop: spacing.xs }}>{event.detail}</Text>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </ScreenContainer>
  );
}
