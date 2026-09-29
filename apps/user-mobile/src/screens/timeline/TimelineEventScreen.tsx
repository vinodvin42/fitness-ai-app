import React from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { TimelineEventType } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { colors, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "TimelineEvent">;

const BADGE_LABEL: Record<TimelineEventType, string> = {
  pr: "PR",
  milestone: "Milestone",
  program_complete: "Program Complete",
};

const BADGE_COLOR: Record<TimelineEventType, string> = {
  pr: colors.warning,
  milestone: colors.accent,
  program_complete: colors.success,
};

/**
 * Timeline Event (docs/mobile/03-screen-inventory.md §G) — detail view of
 * a single timeline entry. The event isn't a database row (see
 * timeline.service.ts), so it's passed whole through navigation params
 * rather than re-fetched by id — there's no single-event endpoint to fetch
 * from. Not built: the design's "progress track" visual — a single
 * point-in-time event doesn't have a continuous progress series to plot
 * without extra queries this pass doesn't add; and cross-stack deep links
 * (e.g. "View Program" for a program_complete event, which would need to
 * jump from this MoreStack screen into TrainStack's ProgramCompletion) —
 * left as plain text instead of a fragile cross-stack navigation call.
 */
export function TimelineEventScreen({ route }: Props) {
  const { t } = useTranslation();
  const { event } = route.params;

  return (
    <ScreenContainer title={t("timelineExtra.eventTitle")}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BADGE_COLOR[event.type] }} />
          <Text style={{ color: BADGE_COLOR[event.type], ...typography.meta }}>{BADGE_LABEL[event.type]}</Text>
        </View>
        <Text style={{ color: colors.textPrimary, ...typography.h1 }}>{event.title}</Text>
        <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>{event.detail}</Text>
        <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>
          {new Date(event.occurredAt).toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </Card>
    </ScreenContainer>
  );
}
