import React from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { ListRow } from "../../components/ListRow";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchReadiness, fetchRecoverySummary, fetchRecoveryTrends } from "../../api/recovery";
import { localYmd } from "../../lib/sleepStats";
import { PROVIDER_LABEL, timeAgo } from "../../lib/format";
import { colors, fonts, radius, spacing, typography, themed } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { ActionButton, SectionLabel } from "./parts";
import { SleepSummaryCard, TrendsCard } from "./RecoverySections";

type Props = NativeStackScreenProps<RecoverStackParamList, "RecoverHub">;

const BAND = themed(() => ({
  ready: { label: "Ready to train", fg: colors.success, bg: colors.successSoft },
  moderate: { label: "Train with care", fg: colors.warning, bg: colors.warningSoft },
  rest: { label: "Take it easy", fg: colors.danger, bg: colors.dangerSoft },
} as const));

const STRESS = themed(() => ({
  low: { label: "Low", fg: colors.success, bg: colors.successSoft },
  moderate: { label: "Moderate", fg: colors.warning, bg: colors.warningSoft },
  high: { label: "High", fg: colors.danger, bg: colors.dangerSoft },
} as const));

/** "8h 12m" from decimal hours. */
function sleepText(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

/** "Galaxy Watch via Health Connect", or just "Health Connect" when the device is the source itself. */
function deviceSource(name: string, provider: string): string {
  return name.trim().toLowerCase() === provider.trim().toLowerCase() ? name : `${name} via ${provider}`;
}

function Tile({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.sm + 4,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 13 }} numberOfLines={1}>
          {label}
        </Text>
        <Icon name={icon} size={13} color={colors.textSecondary} />
      </View>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 17 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
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
          <Text style={{ color: colors.accentText, ...typography.caption }}>{tag}</Text>
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
 *
 * 24 Oct 2026, Figma recover/01 (fynrox-final-360): the readiness card leads
 * with last night's sleep and the band, the score stays as a small line under
 * it; "Key Metrics" tiles; "Fynrox AI insight"; device line "X via Y · Synced".
 */
export function RecoverScreen({ navigation }: Props) {
  const readiness = useQuery({ queryKey: ["recovery", "readiness"], queryFn: fetchReadiness });
  const summary = useQuery({ queryKey: ["recovery", "summary"], queryFn: fetchRecoverySummary });
  // Sleep and Trends cards (owner, 25 Oct 2026): this week and the week before.
  const trends = useQuery({ queryKey: ["recovery", "trends", 14], queryFn: () => fetchRecoveryTrends(14) });
  const today = localYmd();
  const r = readiness.data;
  const s = summary.data;
  const band = r?.band ? BAND[r.band] : null;
  const metrics = r?.metrics;
  const stress = s?.stress ? STRESS[s.stress.level] : null;
  const refreshing = readiness.isRefetching || summary.isRefetching || trends.isRefetching;

  const startYoga = () => navigation.navigate("GuidedSession", { routineId: "gentle-yoga" });
  // Owner, 24 Oct 2026: with no device connected, "Connect a device" comes first (shown once the summary has
  // loaded, so a connected member never sees it flash in).
  const noDevice = !!s && (!s.device || s.device.status === "disconnected");

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
            trends.refetch();
          }}
          tintColor={colors.accent}
        />
      }
    >
      {noDevice ? (
        <Card style={{ gap: spacing.sm, borderColor: colors.accent }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View
              style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name="watch" size={20} color={colors.accentText} />
            </View>
            <Text style={{ flex: 1, color: colors.textPrimary, ...typography.h2 }}>Connect a device</Text>
          </View>
          <Text style={{ color: colors.textSecondary, ...typography.meta, fontSize: 13, lineHeight: 19 }}>
            Sync sleep, heart rate and steps from your watch or phone, so your recovery score fills in by itself.
          </Text>
          <ActionButton label="Connect a device" icon="watch" onPress={() => navigation.navigate("ConnectedDevices")} />
          <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceRaised }}>
            <Icon name="smartphone" size={16} color={colors.textSecondary} />
            <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              No watch? Your phone works too. On Android, connect Health Connect and turn on sharing in Google Fit: the steps your phone counts come in.
            </Text>
          </View>
          <Pressable onPress={() => navigation.navigate("Recovery")} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "center" }}>
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>Or log today's recovery yourself</Text>
          </Pressable>
        </Card>
      ) : null}

      {readiness.isLoading ? (
        <SkeletonCard lines={3} />
      ) : readiness.isError ? (
        <ErrorState message="Couldn't load your readiness." onRetry={() => readiness.refetch()} />
      ) : r && r.score != null && band ? (
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 13 }}>Readiness</Text>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 28, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>
                {metrics?.sleepHours != null ? `Slept ${sleepText(metrics.sleepHours)}` : `${r.score}/100`}
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
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              {r.summary ?? "Based on the sleep, resting heart rate and how-rested readings you logged."}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 26 }} accessibilityLabel="Score components">
              {r.components.map((c) => (
                <View
                  key={c.key}
                  style={{ width: 6, height: Math.max(4, (c.score / 100) * 26), borderRadius: 2, backgroundColor: colors.accent }}
                />
              ))}
            </View>
            {metrics?.sleepHours != null ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Recovery score {r.score}/100 · {r.basis}</Text>
            ) : null}
          </View>
        </Card>
      ) : (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 13 }}>Recovery score</Text>
          <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Not enough data yet</Text>
          <Text style={{ color: colors.textSecondary, ...typography.meta }}>
            {r?.reason ?? "Log your sleep, resting heart rate, sore muscles or energy to see your recovery score."}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton label="Log recovery" onPress={() => navigation.navigate("Recovery")} style={{ flex: 1 }} />
            {noDevice ? null : (
              <ActionButton label="Connect a device" onPress={() => navigation.navigate("ConnectedDevices")} variant="dark" style={{ flex: 1 }} />
            )}
          </View>
        </Card>
      )}

      {trends.data ? (
        <SleepSummaryCard
          items={trends.data.items}
          needHours={trends.data.sleepNeedHours}
          today={today}
          onOpen={() => navigation.navigate("Sleep")}
          onLog={() => navigation.navigate("Recovery")}
        />
      ) : null}

      <SectionLabel>Key Metrics</SectionLabel>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Tile label="Sleep" value={metrics?.sleepHours != null ? sleepText(metrics.sleepHours) : "—"} icon="moon" />
        <Tile label="HRV" value={metrics?.hrvMs != null ? `${Math.round(metrics.hrvMs)} ms` : "—"} icon="activity" />
        <Tile
          label="Resting HR"
          value={metrics?.restingHeartRate != null ? `${metrics.restingHeartRate} bpm` : "—"}
          icon="heart"
        />
      </View>

      {stress && s?.stress ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + 2 }}>
          <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: stress.fg, opacity: 0.85 }} />
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

      {trends.data ? <TrendsCard items={trends.data.items} today={today} onOpen={() => navigation.navigate("RecoveryTrends")} /> : null}

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
            <Text style={{ color: colors.textPrimary, ...typography.h3, fontSize: 14, letterSpacing: 0.3 }}>
              ✦ FYNROX AI INSIGHT
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, ...typography.body, fontSize: 13 }}>{s.insight.text}</Text>
        </Card>
      ) : null}

      {noDevice ? null : (
      <Pressable
        onPress={() => navigation.navigate("ConnectedDevices")}
        accessibilityRole="button"
        accessibilityLabel="Connected devices"
      >
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm + 4 }}>
          <Icon name="watch" size={16} color={colors.textSecondary} />
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14, flex: 1 }} numberOfLines={2}>
            {s?.device
              ? `${deviceSource(s.device.name, PROVIDER_LABEL[s.device.provider] ?? s.device.provider)} · ${
                  s.device.status === "error" ? "Sync error" : `Synced ${timeAgo(s.device.lastSyncAt)}`
                }`
              : "No synced device yet · Connect one"}
          </Text>
          <Icon name="chevron-right" size={16} color={colors.textSecondary} />
        </Card>
      </Pressable>
      )}

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
        subtitle="Note your sleep, resting heart rate, sore muscles and energy"
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
