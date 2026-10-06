import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { WorkoutDetail } from "@fitness-ai-app/types";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { agoShort, formatDayAndTime } from "../../lib/format";
import { colors, fonts, layout, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";

/**
 * Figma Today 07 (loading skeleton) and 08 (offline with cached workout).
 * Both share the plain "Today / Good Morning, <name>" header the frames use
 * instead of the avatar header of the live screen.
 */

const cardBase = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.card,
  padding: 16,
  gap: 10,
} as const;

function Shell({ children, topGap = 0 }: { children: React.ReactNode; topGap?: number }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: "100%",
          maxWidth: layout.maxContentWidth,
          alignSelf: "center",
          paddingHorizontal: layout.screenPadding,
          paddingTop: spacing.sm + topGap,
          paddingBottom: spacing.xl,
          gap: 16,
        }}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function PlainHeader({ greeting, firstName }: { greeting: string; firstName: string }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={{ color: colors.textPrimary, ...typography.h1 }}>Today</Text>
      <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
        {greeting}, {firstName}
      </Text>
    </View>
  );
}

// ---- 07 Loading ----------------------------------------------------------

export function TodayLoadingView({ greeting, firstName }: { greeting: string; firstName: string }) {
  const { colors: theme } = useTheme();
  return (
    <Shell>
      <PlainHeader greeting={greeting} firstName={firstName} />
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Fetching your day"
        style={{ backgroundColor: theme.accent, borderRadius: radius.card, padding: 16, gap: 2 }}
      >
        <Text style={{ color: theme.textOnAccent, ...typography.h3 }}>Fetching your day...</Text>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Loading your plan and latest synced data.</Text>
      </View>

      <View style={cardBase}>
        <Text style={{ color: colors.textPrimary, ...typography.h3, letterSpacing: 0.4 }}>YOUR DAILY BRIEF</Text>
        <Skeleton height={10} width="92%" />
        <Skeleton height={10} width="78%" />
        <Skeleton height={10} width="52%" />
      </View>

      <View style={cardBase}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Readiness</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Skeleton width={64} height={64} borderRadius={32} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={12} width="55%" />
            <Skeleton height={10} width="95%" />
            <Skeleton height={10} width="75%" />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flex: 1, gap: 6, padding: 8, borderRadius: radius.md, backgroundColor: colors.background }}>
              <Skeleton height={8} width="60%" />
              <Skeleton height={10} width="40%" />
            </View>
          ))}
        </View>
      </View>

      <View style={cardBase}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Today's workout</Text>
        <Skeleton height={14} width="65%" />
        <Skeleton height={10} width="40%" />
        <Skeleton height={44} borderRadius={radius.md} style={{ marginTop: 4 }} />
      </View>

      <View style={cardBase}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Nutrition snapshot</Text>
        <Skeleton height={12} width="82%" />
        <Skeleton height={12} width="52%" />
      </View>

      <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center", lineHeight: 17 }}>
        Scores and recommendations appear when loading finishes.{"\n"}You can still browse Train, Fuel or Recover.
      </Text>
    </Shell>
  );
}

// ---- 08 Offline ----------------------------------------------------------

interface OfflineProps {
  greeting: string;
  firstName: string;
  /** dataUpdatedAt (ms) of the cached "next workout" query, or 0 when nothing is cached. */
  lastSyncedAt: number;
  workout: { id: string; name: string; durationMinutes: number; intensity: string } | null;
  /** Cached workout detail (exercise count), when the user has opened it before. */
  detail: WorkoutDetail | undefined;
  savedAt: number;
  onStart: () => void;
  onRetry: () => void;
  retrying: boolean;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function TodayOfflineView({ greeting, firstName, lastSyncedAt, workout, detail, savedAt, onStart, onRetry, retrying }: OfflineProps) {
  const { colors: theme } = useTheme();
  const meta = workout
    ? [`${workout.durationMinutes} min`, capitalise(workout.intensity), detail ? `${detail.exercises.length} exercises` : null]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    // topGap clears the global "No internet connection" strip that overlays the very top of every screen.
    <Shell topGap={spacing.lg}>
      <PlainHeader greeting={greeting} firstName={firstName} />

      <View
        accessibilityRole="alert"
        style={{ backgroundColor: "rgba(251,191,36,0.07)", borderWidth: 1, borderColor: colors.warning, borderRadius: radius.card, padding: 16, gap: 8 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="wifi-off" size={18} color={colors.warning} />
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>You're offline</Text>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          {workout
            ? "Your saved workout is ready. Today's plan and wearable data can't refresh without a connection."
            : "Today's plan and wearable data can't load without a connection."}
        </Text>
        {lastSyncedAt > 0 ? (
          <Text style={{ color: colors.warning, fontSize: 12 }}>
            Last synced {formatDayAndTime(lastSyncedAt)} · {agoShort(lastSyncedAt)}
          </Text>
        ) : (
          <Text style={{ color: colors.warning, fontSize: 12 }}>Nothing has been saved on this device yet.</Text>
        )}
        <Pressable onPress={onRetry} disabled={retrying} accessibilityRole="button" accessibilityLabel="Try reconnecting" hitSlop={8}>
          <Text style={{ color: theme.accent, ...typography.label, fontSize: 12 }}>{retrying ? "Checking connection..." : "Try reconnecting ›"}</Text>
        </Pressable>
      </View>

      {workout ? (
        <View style={cardBase}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="download" size={14} color={theme.accent} />
            <Text style={{ color: theme.accent, fontSize: 11, letterSpacing: 0.8, fontFamily: fonts.bodySemi }}>AVAILABLE OFFLINE</Text>
          </View>
          <Text style={{ color: colors.textPrimary, ...typography.h1, fontSize: 22 }}>{workout.name}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{meta}</Text>
          {detail && savedAt > 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Saved {formatDayAndTime(savedAt)}</Text>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Open this workout once while online to save its full exercise list.</Text>
          )}
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {detail
              ? "Exercises and cues are saved on this device. Video demos need a connection."
              : "The workout summary is saved on this device."}
          </Text>
          <Pressable
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel="Start cached workout"
            style={{ height: 48, borderRadius: radius.md, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 }}
          >
            <Icon name="play" size={16} color={theme.textOnAccent} />
            <Text style={{ color: theme.textOnAccent, ...typography.h3 }}>Start cached workout</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={cardBase}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Wearable data not refreshed</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          Your latest recovery data and readiness score are unavailable. Reconnect to fetch them.
        </Text>
      </View>

      <View style={cardBase}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Logging needs a connection</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          Sets are saved to your account as you log them, so recording this workout needs a connection. Your plan and exercise list stay available here.
        </Text>
      </View>
    </Shell>
  );
}
