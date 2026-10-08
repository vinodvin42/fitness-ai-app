import React from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { ProgressRing } from "../../components/ProgressRing";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchReadiness, fetchRecoverySummary } from "../../api/recovery";
import { PROVIDER_LABEL, timeAgo } from "../../lib/format";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { ActionButton, SectionLabel } from "./parts";

type Props = NativeStackScreenProps<RecoverStackParamList, "RecoverHub">;

const BAND = {
  ready: { label: "Ready to train", fg: colors.success, bg: colors.successSoft },
  moderate: { label: "Train with care", fg: colors.warning, bg: colors.warningSoft },
  rest: { label: "Take it easy", fg: colors.danger, bg: colors.dangerSoft },
} as const;

const STRESS = {
  low: { label: "Low", fg: colors.success, bg: colors.successSoft },
  moderate: { label: "Moderate", fg: colors.warning, bg: colors.warningSoft },
  high: { label: "High", fg: colors.danger, bg: colors.dangerSoft },
} as const;

function Tile({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.sm,
        padding: spacing.sm + 2,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }} numberOfLines={1}>
          {label}
        </Text>
        <Icon name={icon} size={13} color={colors.textSecondary} />
      </View>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 16 }}>{value}</Text>
    </View>
  );
}

function ActionCard({
  title,
  body,
  tag,
  primary,
  secondary,
}: {
  title: string;
  body: string;
  tag: string;
  primary: { label: string; onPress: () => void };
  secondary: { label: string; onPress: () => void };
}) {
  return (
    <Card style={{ gap: spacing.sm + 2 }}>
      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>{title}</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 4 }}>{body}</Text>
        </View>
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.accent,
            backgroundColor: colors.accentSoft,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: colors.accent, ...typography.caption }}>{tag}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ActionButton label={primary.label} onPress={primary.onPress} style={{ flex: 3 }} />
        <ActionButton label={secondary.label} onPress={secondary.onPress} variant="dark" style={{ flex: 2 }} />
      </View>
    </Card>
  );
}

/**
 * Recover 01 - Recovery dashboard. Every number comes from the user's own
 * RecoveryLog / device syncs: readiness from GET /recovery/readiness (formula
 * in apps/api recovery/readiness.ts), activity / stress / insight / latest
 * device from GET /recovery/summary. Missing data is shown as an honest
 * prompt or "-", never a made-up value.
 */
export function RecoverScreen({ navigation }: Props) {
  const readiness = useQuery({ queryKey: ["recovery", "readiness"], queryFn: fetchReadiness });
  const summary = useQuery({ queryKey: ["recovery", "summary"], queryFn: fetchRecoverySummary });
  const r = readiness.data;
  const s = summary.data;
  const band = r?.band ? BAND[r.band] : null;
  const metrics = r?.metrics;
  const stress = s?.stress ? STRESS[s.stress.level] : null;
  const refreshing = readiness.isRefetching || summary.isRefetching;

  const startYoga = () => navigation.navigate("GuidedSession", { routineId: "gentle-yoga" });

  return (
    <ScreenContainer
      title="Recovery"
      subtitle="Today's Recovery Summary"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            readiness.refetch();
            summary.refetch();
          }}
          tintColor={colors.accent}
        />
      }
    >
      {readiness.isLoading ? (
        <SkeletonCard lines={3} />
      ) : readiness.isError ? (
        <ErrorState message="Couldn't load your readiness." onRetry={() => readiness.refetch()} />
      ) : r && r.score != null && band ? (
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>Readiness Score</Text>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 32, marginTop: 2 }}>
                {r.score}/100
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderWidth: 1,
                borderColor: band.fg,
                backgroundColor: band.bg,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: 4,
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: band.fg }} />
              <Text style={{ color: band.fg, ...typography.caption, fontFamily: fonts.bodySemi }}>{band.label}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <ProgressRing progress={r.score / 100} size={76} strokeWidth={8} color={colors.accent}>
              <Text style={{ color: colors.textMuted, fontSize: 9 }}>Score</Text>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 16 }}>{r.score}</Text>
            </ProgressRing>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                {r.summary ?? "Based on your logged sleep, HRV, and resting heart rate."}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 26 }} accessibilityLabel="Score components">
                {r.components.map((c) => (
                  <View
                    key={c.key}
                    style={{ width: 8, height: Math.max(4, (c.score / 100) * 26), borderRadius: 2, backgroundColor: colors.accent }}
                  />
                ))}
              </View>
            </View>
          </View>
        </Card>
      ) : (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>Readiness Score</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Not enough data yet</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>
            {r?.reason ?? "Log sleep, HRV, resting heart rate, soreness or energy to see your readiness."}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton label="Log recovery" onPress={() => navigation.navigate("Recovery")} style={{ flex: 1 }} />
            <ActionButton label="Connect a device" onPress={() => navigation.navigate("ConnectedDevices")} variant="dark" style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      <SectionLabel>Key Metrics</SectionLabel>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Tile label="Sleep" value={metrics?.sleepHours != null ? `${metrics.sleepHours}h` : "—"} icon="moon" />
        <Tile label="HRV" value={metrics?.hrvMs != null ? `${metrics.hrvMs}ms` : "—"} icon="activity" />
        <Tile
          label="Resting HR"
          value={metrics?.restingHeartRate != null ? `${metrics.restingHeartRate} bpm` : "—"}
          icon="heart"
        />
      </View>

      {stress && s?.stress ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + 2 }}>
          <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: stress.fg, opacity: 0.85 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Stress</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>{stress.label}</Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: stress.fg,
              backgroundColor: stress.bg,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm + 2,
              paddingVertical: 4,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stress.fg }} />
            <Text style={{ color: stress.fg, ...typography.caption, fontFamily: fonts.bodySemi }}>{stress.label}</Text>
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 16 }}>Activity Summary</Text>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>Today</Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Tile label="Steps" value={s?.activity?.steps != null ? s.activity.steps.toLocaleString() : "—"} icon="footprints" />
          <Tile label="Active Calories" value={s?.activity?.activeCalories != null ? String(s.activity.activeCalories) : "—"} icon="flame" />
          <Tile label="Active Minutes" value={s?.activity?.activeMinutes != null ? String(s.activity.activeMinutes) : "—"} icon="clock" />
        </View>
        {!s?.activity ? (
          <Text style={{ color: colors.textMuted, ...typography.meta }}>
            No synced activity for today yet. Values appear after a device sync or manual import.
          </Text>
        ) : null}
      </Card>

      {s?.insight ? (
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="sparkles" size={16} color={colors.textOnAccent} />
            </View>
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 13, letterSpacing: 0.3 }}>
              FYNROX RECOVERY INSIGHT
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13 }}>{s.insight.text}</Text>
        </Card>
      ) : null}

      <Pressable
        onPress={() => navigation.navigate("ConnectedDevices")}
        accessibilityRole="button"
        accessibilityLabel="Connected devices"
      >
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm + 4 }}>
          <Icon name="watch" size={16} color={colors.textSecondary} />
          <Text style={{ color: colors.textPrimary, ...typography.body, fontSize: 14, flex: 1 }}>
            {s?.device
              ? `${s.device.name} · ${s.device.status === "error" ? "Sync error" : `Synced ${timeAgo(s.device.lastSyncAt)}`}`
              : "No synced device yet · Connect one"}
          </Text>
          {s?.device ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {PROVIDER_LABEL[s.device.provider] ?? s.device.provider}
            </Text>
          ) : null}
        </Card>
      </Pressable>

      <SectionLabel>Recovery Actions</SectionLabel>
      <ActionCard
        title="Yoga & Mobility"
        body="Gentle movements and breathing to help you unwind."
        tag="Yoga"
        primary={{ label: "Open library", onPress: () => navigation.navigate("YogaLibrary") }}
        secondary={{ label: "Quick start", onPress: startYoga }}
      />
      <ActionCard
        title="Guided Breathing"
        body="5-minute session to calm your nervous system."
        tag="Breathing"
        primary={{ label: "Start session", onPress: () => navigation.navigate("GuidedBreathing", { patternId: "easy", autoStart: true }) }}
        secondary={{ label: "View details", onPress: () => navigation.navigate("GuidedBreathing", { patternId: "easy" }) }}
      />
      <ActionCard
        title="Shoulder & Hamstring Mobility"
        body="Gentle routine with chair support and easy options."
        tag="Mobility"
        primary={{
          label: "Start routine",
          onPress: () => navigation.navigate("GuidedSession", { routineId: "shoulder-hamstring-mobility" }),
        }}
        secondary={{
          label: "View steps",
          onPress: () => navigation.navigate("RoutineDetail", { routineId: "shoulder-hamstring-mobility" }),
        }}
      />

      <ListRow
        icon="heart-pulse"
        title="Log today's recovery"
        subtitle="Self-report sleep, resting HR, HRV, soreness & energy"
        tint={colors.danger}
        tintSoft={colors.dangerSoft}
        onPress={() => navigation.navigate("Recovery")}
      />
      <ListRow
        icon="sparkles"
        title="Chat with Fynrox AI"
        subtitle="Training, nutrition and recovery guidance"
        tint={colors.aiAccent}
        tintSoft={colors.aiAccentSoft}
        onPress={() => navigation.navigate("AiCoach")}
      />
      <Button label="Connected devices" variant="secondary" onPress={() => navigation.navigate("ConnectedDevices")} />
    </ScreenContainer>
  );
}
