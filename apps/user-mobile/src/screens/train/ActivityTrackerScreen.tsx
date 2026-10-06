import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import * as Location from "expo-location";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ActivitySummaryRange } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { Pill } from "../../components/Pill";
import { TextField } from "../../components/TextField";
import { SegmentedControl } from "../../components/SegmentedControl";
import { BarChart } from "../../components/Charts";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { StatTile } from "../../components/StatTile";
import { useToast } from "../../components/Toast";
import { createActivity, fetchActivities, fetchActivitySummary } from "../../api/activities";
import { extractErrorMessage } from "../../lib/apiError";
import { formatDateTime, formatDuration, formatKm, formatPace, formatRate, formatSpeed, kindLabel } from "../../lib/activityFormat";
import { TrackAccumulator, encodeRouteWithinLimit, paceSecPerKm, speedKmh, type GpsFix } from "../../lib/gpsTrack";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { TrainStackParamList } from "../../navigation/TrainStack";

type Props = NativeStackScreenProps<TrainStackParamList, "ActivityTracker">;

const RANGES = [
  { value: "4w", label: "4w" },
  { value: "12w", label: "12w" },
  { value: "26w", label: "26w" },
  { value: "52w", label: "52w" },
] as const;

type Phase = "idle" | "running" | "paused" | "finishing";
type Mode = "gps" | "manual";
type PermState = "unknown" | "denied";

const isWeb = Platform.OS === "web";

function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/**
 * Running (Train 14) / Cycling (Train 15) tracker, parameterized by `kind`.
 * Native: foreground GPS tracking (expo-location watchPositionAsync) saved as
 * source "tracked" with an encoded route. It only records while the app is open
 * (no background location). Web, or "Track manually": a stopwatch with the
 * distance typed in, saved as "manual". History comes from /activities.
 */
export function ActivityTrackerScreen({ navigation, route }: Props) {
  const { kind } = route.params;
  const label = kindLabel(kind);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 600) - 2 * (spacing.md + spacing.md);

  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<Date | null>(null);
  const accumulatedRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const [mode, setMode] = useState<Mode>(isWeb ? "manual" : "gps");
  const [perm, setPerm] = useState<PermState>("unknown");
  const [live, setLive] = useState({ distanceM: 0, elevationGainM: 0, points: 0, searching: true });
  const accRef = useRef<TrackAccumulator>(new TrackAccumulator(kind));
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const [distanceKm, setDistanceKm] = useState("");
  const [notes, setNotes] = useState("");
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [range, setRange] = useState<ActivitySummaryRange>("12w");

  // Wall-clock based so backgrounding the app doesn't lose time.
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      setElapsedMs(accumulatedRef.current + (segmentStartRef.current ? Date.now() - segmentStartRef.current : 0));
    }, 500);
    return () => clearInterval(id);
  }, [phase]);

  const stopWatching = () => {
    subRef.current?.remove();
    subRef.current = null;
  };
  const startWatching = async () => {
    stopWatching();
    accRef.current.breakSegment();
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 1500 },
      (loc) => {
        const fix: GpsFix = {
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          t: loc.timestamp,
          accuracy: loc.coords.accuracy,
          altitude: loc.coords.altitude,
        };
        accRef.current.add(fix);
        const snap = accRef.current.snapshot();
        setLive({ distanceM: snap.distanceM, elevationGainM: snap.elevationGainM, points: snap.points, searching: snap.points === 0 });
      },
    );
    subRef.current = sub;
  };
  // Never leave the GPS running after leaving the screen.
  useEffect(() => stopWatching, []);

  const begin = () => {
    startedAtRef.current = new Date();
    accumulatedRef.current = 0;
    segmentStartRef.current = Date.now();
    setElapsedMs(0);
    setPhase("running");
  };
  const start = async () => {
    if (mode === "manual") {
      begin();
      return;
    }
    try {
      const existing = await Location.getForegroundPermissionsAsync();
      const res = existing.granted ? existing : await Location.requestForegroundPermissionsAsync();
      if (!res.granted) {
        setPerm("denied");
        return;
      }
      setPerm("unknown");
      accRef.current = new TrackAccumulator(kind);
      setLive({ distanceM: 0, elevationGainM: 0, points: 0, searching: true });
      await startWatching();
      begin();
    } catch {
      stopWatching();
      toast.show("Couldn't start GPS. Check that location services are on, or track manually.", "error");
    }
  };
  const trackManually = () => {
    setMode("manual");
    setPerm("unknown");
  };
  const pause = () => {
    if (mode === "gps") stopWatching();
    if (segmentStartRef.current) accumulatedRef.current += Date.now() - segmentStartRef.current;
    segmentStartRef.current = null;
    setElapsedMs(accumulatedRef.current);
    setPhase("paused");
  };
  const resume = async () => {
    if (mode === "gps") {
      try {
        await startWatching();
      } catch {
        toast.show("Couldn't resume GPS. Try again.", "error");
        return;
      }
    }
    segmentStartRef.current = Date.now();
    setPhase("running");
  };
  const stop = () => {
    stopWatching();
    if (segmentStartRef.current) accumulatedRef.current += Date.now() - segmentStartRef.current;
    segmentStartRef.current = null;
    setElapsedMs(accumulatedRef.current);
    setPhase("finishing");
  };
  const discard = () => {
    stopWatching();
    accRef.current = new TrackAccumulator(kind);
    setLive({ distanceM: 0, elevationGainM: 0, points: 0, searching: true });
    accumulatedRef.current = 0;
    segmentStartRef.current = null;
    startedAtRef.current = null;
    setElapsedMs(0);
    setDistanceKm("");
    setNotes("");
    setDistanceError(null);
    setPhase("idle");
  };

  const summaryQuery = useQuery({
    queryKey: ["activities", "summary", kind, range],
    queryFn: () => fetchActivitySummary(kind, range),
  });
  const listQuery = useQuery({ queryKey: ["activities", "list", kind], queryFn: () => fetchActivities(kind) });

  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    }, [queryClient]),
  );

  const save = useMutation({
    mutationFn: () => {
      if (mode === "gps") {
        const snap = accRef.current.snapshot();
        const route = accRef.current.getRoute();
        return createActivity({
          kind,
          startedAt: (startedAtRef.current ?? new Date()).toISOString(),
          durationSeconds: Math.round(accumulatedRef.current / 1000),
          distanceMeters: Math.round(snap.distanceM),
          elevationGainM: snap.elevationGainM,
          routePolyline: route.length >= 2 ? encodeRouteWithinLimit(route) : undefined,
          source: "tracked",
          notes: notes.trim() ? notes.trim() : undefined,
        });
      }
      const km = parseFloat(distanceKm.replace(",", "."));
      return createActivity({
        kind,
        startedAt: (startedAtRef.current ?? new Date()).toISOString(),
        durationSeconds: Math.round(accumulatedRef.current / 1000),
        distanceMeters: Math.round(km * 1000),
        source: "manual",
        notes: notes.trim() ? notes.trim() : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.show(`${label} saved`, "success");
      discard();
    },
    onError: (err) => toast.show(extractErrorMessage(err, `Couldn't save that ${label.toLowerCase()}.`), "error"),
  });

  const onSave = () => {
    if (mode === "gps") {
      if (live.distanceM < 10 || accumulatedRef.current < 10_000) {
        setDistanceError("Not enough tracked distance or time to save (need at least 10 m and 10 seconds).");
        return;
      }
      setDistanceError(null);
      save.mutate();
      return;
    }
    const km = parseFloat(distanceKm.replace(",", "."));
    const seconds = Math.round(accumulatedRef.current / 1000);
    if (!Number.isFinite(km) || km < 0.01 || km > 1000) {
      setDistanceError("Enter the distance in km (0.01 to 1000).");
      return;
    }
    if (seconds < 10) {
      setDistanceError("The timer must run for at least 10 seconds to save an activity.");
      return;
    }
    setDistanceError(null);
    save.mutate();
  };

  const summary = summaryQuery.data;
  const timeText = formatDuration(elapsedMs / 1000);
  const gpsActive = mode === "gps" && phase !== "idle";
  const movingSec = elapsedMs / 1000;
  const paceText = kind === "run" ? formatPace(paceSecPerKm(live.distanceM, movingSec)) : formatSpeed(speedKmh(live.distanceM, movingSec));

  return (
    <ScreenContainer title={kind === "run" ? "Running" : "Cycling"} subtitle={mode === "gps" ? "GPS tracking" : "Manual tracking"}>
      <BackButton onPress={() => navigation.goBack()} />

      <Card style={{ gap: spacing.sm }}>
        {mode === "gps" ? (
          <>
            <Pill label={phase === "running" && live.searching ? "Searching for GPS signal..." : "GPS tracking"} tone="neutral" />
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              Tracking works only while 23PrimeFit is open on screen. Keep the app open and the screen on; location is not recorded in the background.
            </Text>
          </>
        ) : (
          <>
            <Pill label="Manual tracking" tone="warning" />
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {isWeb ? "GPS isn't available on web. " : ""}Start the timer, then enter your distance when you finish. {label}s are saved as manual activities.
            </Text>
          </>
        )}
        {perm === "denied" && phase === "idle" ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Location access is off</Text>
            <Text style={{ color: colors.textSecondary }}>
              Allow location access while using the app to record your distance and route. You can also track manually and type your distance in.
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button label="Open Settings" onPress={() => Linking.openSettings().catch(() => undefined)} style={{ flex: 1 }} />
              <Button label="Track manually" variant="secondary" onPress={trackManually} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
        <Text
          accessibilityLabel={`Elapsed time ${timeText}`}
          style={{ color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 56, textAlign: "center", marginVertical: spacing.sm }}
        >
          {timeText}
        </Text>

        {gpsActive ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StatTile icon="target" label="Distance" value={formatKm(live.distanceM)} />
            <StatTile icon="zap" label={kind === "run" ? "Pace" : "Speed"} value={paceText} tint={colors.orange} tintSoft={colors.warningSoft} />
          </View>
        ) : null}
        {gpsActive && phase === "paused" ? (
          <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>Paused: GPS is off until you resume.</Text>
        ) : null}

        {phase === "idle" ? (
          <>
            <Button label={`Start ${label.toLowerCase()}`} onPress={start} />
            {mode === "gps" && perm !== "denied" ? (
              <Pressable onPress={trackManually} accessibilityRole="button" accessibilityLabel="Track manually instead" hitSlop={8}>
                <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>Track manually instead</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
        {phase === "running" ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Pause" variant="secondary" onPress={pause} style={{ flex: 1 }} />
            <Button label="Finish" onPress={stop} style={{ flex: 1 }} />
          </View>
        ) : null}
        {phase === "paused" ? (
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Resume" onPress={resume} style={{ flex: 1 }} />
            <Button label="Finish" variant="secondary" onPress={stop} style={{ flex: 1 }} />
          </View>
        ) : null}
        {phase === "finishing" ? (
          <View style={{ gap: spacing.sm }}>
            {mode === "gps" ? (
              <>
                <Text style={{ color: colors.textSecondary }}>
                  {formatKm(live.distanceM)} in {timeText} ({paceText}){live.elevationGainM > 0 ? `, ${live.elevationGainM} m climb` : ""}
                </Text>
                {distanceError ? <Text style={{ color: colors.danger, ...typography.meta }}>{distanceError}</Text> : null}
              </>
            ) : (
              <TextField
                label="Distance (km)"
                value={distanceKm}
                onChangeText={setDistanceKm}
                keyboardType="decimal-pad"
                placeholder="e.g. 5.2"
                error={distanceError}
              />
            )}
            <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} maxLength={500} placeholder="How did it feel?" />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button label="Discard" variant="secondary" onPress={discard} style={{ flex: 1 }} />
              <Button label={`Save ${label.toLowerCase()}`} onPress={onSave} loading={save.isPending} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
        {phase === "paused" || phase === "running" ? (
          <Pressable onPress={discard} accessibilityRole="button" accessibilityLabel="Discard this session" hitSlop={8}>
            <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>Discard session</Text>
          </Pressable>
        ) : null}
      </Card>

      <SegmentedControl options={RANGES} value={range} onChange={setRange} />

      {summaryQuery.isError ? (
        <ErrorState onRetry={() => summaryQuery.refetch()} />
      ) : summaryQuery.isLoading || !summary ? (
        <Skeleton height={180} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StatTile icon="activity" label={`${label}s`} value={summary.count} />
            <StatTile icon="target" label="Distance" value={formatKm(summary.distanceMeters)} tint={colors.success} tintSoft={colors.successSoft} />
            <StatTile
              icon="zap"
              label={kind === "run" ? "Avg pace" : "Avg speed"}
              value={kind === "run" ? formatPace(summary.avgPaceSecPerKm) : formatSpeed(summary.avgSpeedKmh)}
              tint={colors.orange}
              tintSoft={colors.warningSoft}
            />
          </View>
          <Card>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Weekly distance</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta, marginBottom: spacing.sm }}>Kilometres per week</Text>
            {summary.count === 0 ? (
              <Text style={{ color: colors.textSecondary }}>No {label.toLowerCase()}s in this range yet.</Text>
            ) : (
              <BarChart
                data={summary.weeks.map((w) => ({ label: weekLabel(w.weekStart), value: Math.round((w.distanceMeters / 1000) * 10) / 10 }))}
                width={chartWidth}
                color={colors.success}
                accessibilityLabel={`Weekly ${label.toLowerCase()} distance in kilometres`}
              />
            )}
          </Card>
        </>
      )}

      <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Recent {label.toLowerCase()}s</Text>
      {listQuery.isError ? (
        <ErrorState onRetry={() => listQuery.refetch()} />
      ) : listQuery.isLoading ? (
        <Skeleton height={64} />
      ) : (listQuery.data ?? []).length === 0 ? (
        <Text style={{ color: colors.textSecondary }}>Nothing logged yet. Your finished {label.toLowerCase()}s will appear here.</Text>
      ) : (
        (listQuery.data ?? []).map((a) => (
          <Pressable
            key={a.id}
            onPress={() => navigation.navigate("ActivityDetail", { activityId: a.id })}
            accessibilityRole="button"
            accessibilityLabel={`${label} on ${formatDateTime(a.startedAt)}, ${formatKm(a.distanceMeters)}`}
          >
            <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{formatKm(a.distanceMeters)}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>{formatDateTime(a.startedAt)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: colors.textSecondary }}>{formatDuration(a.durationSeconds)}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>{formatRate(a)}</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}
