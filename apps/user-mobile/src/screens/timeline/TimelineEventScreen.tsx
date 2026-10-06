import React from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { TimelineEvent, TimelineProgressionPoint } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Icon, IconName } from "../../components/Icon";
import { BRAND_NAME } from "../../lib/brand";
import { CATEGORY_COLOR, CATEGORY_LABEL, TYPE_LABEL, eventShareText, fmtDate, shareText } from "../../lib/timelineFormat";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "TimelineEvent">;

const TYPE_ICON: Record<TimelineEvent["type"], IconName> = {
  pr: "trophy",
  milestone: "sparkles",
  program_complete: "check",
  weight: "scale",
  measurement: "ruler",
  cardio: "footprints",
  recovery: "moon",
  health: "heart-pulse",
  start: "flame",
};

function pointText(p: TimelineProgressionPoint, unit: "kg" | "km") {
  return unit === "kg" ? `${p.value}kg${p.reps != null ? ` × ${p.reps}` : ""}` : `${p.value} km`;
}

/**
 * Milestone Detail (Figma Progress 10). The event is derived, not stored, so
 * it arrives whole through navigation params. Strength PRs show First /
 * Previous / This Milestone and which workout and program it happened in. The
 * insight card is a rule (+5% load) shown only for a lift's latest PR; it has
 * no Accept / Adjust buttons because there is no goal-note endpoint to save to.
 */
export function TimelineEventScreen({ route, navigation }: Props) {
  const { event } = route.params;
  const color = CATEGORY_COLOR[event.category];
  const prog = event.progression;
  const where = event.context;

  const barFill = (() => {
    if (!prog) return 0;
    if (prog.nextTarget == null) return 1;
    const span = prog.nextTarget - prog.first.value;
    return span <= 0 ? 1 : Math.max(0.05, Math.min(1, (prog.current.value - prog.first.value) / span));
  })();

  return (
    <ScreenContainer
      title="Milestone Detail"
      right={
        <Pressable onPress={() => void shareText(eventShareText(event))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share milestone">
          <Icon name="share" size={18} color={colors.textSecondary} />
        </Pressable>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />

      <Card style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: `${color}26`, alignItems: "center", justifyContent: "center" }}>
          <Icon name={TYPE_ICON[event.type]} size={26} color={color} />
        </View>
        <Text style={{ color, ...typography.caption, letterSpacing: 0.6 }}>
          {CATEGORY_LABEL[event.category]} — {TYPE_LABEL[event.type]}
        </Text>
        <Text style={{ color: colors.textPrimary, ...typography.h2, fontSize: 20, textAlign: "center" }}>{event.title}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>
          {fmtDate(event.occurredAt, { month: "long", day: "numeric", year: "numeric" })}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <Text
            style={{
              color: event.evidence === "measured" ? colors.success : colors.warning,
              backgroundColor: event.evidence === "measured" ? colors.successSoft : colors.warningSoft,
              ...typography.caption,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {event.evidence === "measured" ? "Measured" : "Estimated"}
          </Text>
          <Text style={{ color: colors.textSecondary, backgroundColor: colors.surfaceHigh, ...typography.caption, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: "hidden" }}>
            {event.source}
          </Text>
        </View>
      </Card>

      {prog ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textSecondary, ...typography.label }}>Progression Milestones</Text>
          {prog.unit === "kg" ? (
            <Row label="First" date={prog.first.at} value={pointText(prog.first, prog.unit)} />
          ) : null}
          {prog.previous ? <Row label="Previous" date={prog.previous.at} value={pointText(prog.previous, prog.unit)} /> : null}
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.accent, ...typography.label }}>This Milestone</Text>
              <Text style={{ color: colors.accent, fontFamily: fonts.bodyBold }}>
                {pointText(prog.current, prog.unit)}
                {prog.percentChange != null ? ` (${prog.percentChange > 0 ? "+" : ""}${prog.percentChange}%)` : ""}
              </Text>
            </View>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: "hidden" }}>
              <View style={{ width: `${Math.round(barFill * 100)}%`, height: 5, backgroundColor: colors.accent }} />
            </View>
          </View>
        </Card>
      ) : (
        <Card style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>{event.detail}</Text>
        </Card>
      )}

      {where ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm }}>
          <Icon name="flame" size={14} color={colors.orange} />
          <Text style={{ color: colors.textSecondary, ...typography.meta, flex: 1 }}>This was logged during {where}.</Text>
        </Card>
      ) : null}

      {prog?.nextTarget != null && prog.unit === "kg" ? (
        <Card style={{ gap: spacing.xs, borderColor: colors.aiBorder, backgroundColor: colors.aiSurface }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <Icon name="sparkles" size={13} color={colors.aiAccent} />
            <Text style={{ color: colors.aiAccent, ...typography.caption, letterSpacing: 0.8 }}>{BRAND_NAME.toUpperCase()} INSIGHT</Text>
          </View>
          <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 13, lineHeight: 19 }}>
            A 5% load increase from {prog.current.value} kg would be about {prog.nextTarget} kg. Only move up if your form stays solid and you feel recovered. This is a general rule of thumb, not personalised medical advice.
          </Text>
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

function Row({ label, date, value }: { label: string; date: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 }}>
      <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 13 }}>
        {label} <Text style={{ color: colors.textMuted }}>({fmtDate(date, { month: "short", year: "numeric" })})</Text>
      </Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 13 }}>{value}</Text>
    </View>
  );
}
