import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import * as Location from "expo-location";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ActivitySummaryRange } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BackButton } from "../../components/BackButton";
import { TextField } from "../../components/TextField";
import { SegmentedControl } from "../../components/SegmentedControl";
import { BarChart } from "../../components/Charts";
import { Skeleton } from "../../components/Skeleton";
import { ErrorState } from "../../components/ErrorState";
import { StatTile } from "../../components/StatTile";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { createActivity, fetchActivities, fetchActivitySummary } from "../../api/activities";
import { extractErrorMessage } from "../../lib/apiError";
import { miToKm, useMeasureUnits } from "../../lib/measureUnits";
import { formatDateTime, formatDuration, formatKm, formatPace, formatRate, formatSpeed, kindLabel } from "../../lib/activityFormat";
import { TrackAccumulator, encodeRouteWithinLimit, paceSecPerKm, routeToSvgPath, speedKmh, type GpsFix } from "../../lib/gpsTrack";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
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
  const [live, setLive] = useState<{ distanceM: number; elevationGainM: number; points: number; searching: boolean; accuracy: number | null }>({ distanceM: 0, elevationGainM: 0, points: 0, searching: true, accuracy: null });
  const [locked, setLocked] = useState(false);
  const [mapWidth, setMapWidth] = useState(0);
  const accRef = useRef<TrackAccumulator>(new TrackAccumulator(kind));
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const { distanceUnit } = useMeasureUnits();
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
        setLive({ distanceM: snap.distanceM, elevationGainM: snap.elevationGainM, points: snap.points, searching: snap.points === 0, accuracy: fix.accuracy ?? null });
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
      setLive({ distanceM: 0, elevationGainM: 0, points: 0, searching: true, accuracy: null });
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
    setLive({ distanceM: 0, elevationGainM: 0, points: 0, searching: true, accuracy: null });
    accumulatedRef.current = 0;
    segmentStartRef.current = null;
    startedAtRef.current = null;
    setElapsedMs(0);
    setDistanceKm("");
    setNotes("");
    setDistanceError(null);
    setLocked(false);
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
        distanceMeters: Math.round((distanceUnit === "mi" ? miToKm(km) : km) * 1000),
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
    const kmEntered = distanceUnit === "mi" ? miToKm(km) : km;
    const seconds = Math.round(accumulatedRef.current / 1000);
    if (!Number.isFinite(km) || kmEntered < 0.01 || kmEntered > 1000) {
      setDistanceError(`Enter the distance in ${distanceUnit} (0.01 to ${distanceUnit === "mi" ? "620" : "1000"}).`);
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
  const movingSec = elapsedMs / 1000;
  const paceText = kind === "run" ? formatPace(paceSecPerKm(live.distanceM, movingSec), distanceUnit) : formatSpeed(speedKmh(live.distanceM, movingSec), distanceUnit);

  const isRun = kind === "run";
  const liveRoute = mode === "gps" ? accRef.current.getRoute() : [];
  const mapPath = mapWidth > 0 ? routeToSvgPath(liveRoute, mapWidth, 190) : null;
  const splits = mode === "gps" && isRun ? accRef.current.getSplits() : [];
  const gpsBadge =
    phase === "idle"
      ? "GPS ready"
      : live.searching
        ? "Searching for GPS..."
        : live.accuracy == null
          ? "GPS tracking"
          : live.accuracy <= 10
            ? "GPS Strong"
            : live.accuracy <= 20
              ? "GPS Fair"
              : "GPS Weak";
  const panel = isRun ? colors.infoSurface : colors.surface;
  const panelBorder = isRun ? colors.infoBorder : colors.border;
  const tile = (tileLabel: string, value: string) => (
    <View style={{ flex: 1, backgroundColor: panel, borderColor: panelBorder, borderWidth: 1, borderRadius: radius.md, padding: spacing.md - 2 }}>
      <Text style={{ color: colors.textMuted, ...typography.caption, letterSpacing: 0.5 }} numberOfLines={1}>
        {tileLabel.toUpperCase()}
      </Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 19, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
  const circle = (size: number, bg: string) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: bg,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  });
  const centerAction = phase === "idle" ? start : phase === "running" ? pause : phase === "paused" ? resume : undefined;

  return (
    <ScreenContainer
      title={isRun ? "Outdoor Run" : "Outdoor Cycle"}
      right={
        <Pressable
          onPress={() => navigation.navigate("WorkoutSettings")}
          accessibilityRole="button"
          accessibilityLabel="Open workout preferences"
          hitSlop={8}
        >
          <Icon name="settings" size={20} color={isRun ? colors.cyan : colors.textPrimary} />
        </Pressable>
      }
    >
      <BackButton onPress={() => navigation.goBack()} />

      <View
        onLayout={(e) => setMapWidth(Math.round(e.nativeEvent.layout.width))}
        style={{ height: mode === "gps" ? 190 : 96, borderRadius: radius.card, backgroundColor: panel, borderWidth: 1, borderColor: panelBorder, overflow: "hidden" }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={mapPath ? "Live route" : "Route appears here once tracking starts"}
      >
        {mapPath ? (
          <Svg width={mapWidth} height={190}>
            <Path d={mapPath.d} stroke={isRun ? colors.cyan : colors.accent} strokeWidth={4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={mapPath.start[0]} cy={mapPath.start[1]} r={5} fill={colors.success} />
            <Circle cx={mapPath.end[0]} cy={mapPath.end[1]} r={6} fill={colors.orange} />
          </Svg>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.md }}>
            <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
              {mode === "gps" ? "Your route is drawn here as you move. No map tiles are used." : "Manual mode: no route is recorded."}
            </Text>
          </View>
        )}
        <View
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: radius.sm,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: mode !== "gps" ? colors.warning : live.accuracy != null && live.accuracy > 20 ? colors.warning : colors.success,
            }}
          />
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 10 }}>
            {mode === "gps" ? gpsBadge : "Manual tracking"}
          </Text>
        </View>
      </View>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        {mode === "gps"
          ? "Tracking works only while 23PrimeFit is open on screen. Keep the app open; location is not recorded in the background."
          : `${isWeb ? "GPS is not available on web. " : ""}Start the timer, then enter your distance when you finish. Saved as a manual ${label.toLowerCase()}.`}
      </Text>
      {perm === "denied" && phase === "idle" ? (
        <Card style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Location access is off</Text>
          <Text style={{ color: colors.textSecondary }}>
            Allow location access while using the app to record your distance and route. You can also track manually and type your distance in.
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button label="Open Settings" onPress={() => Linking.openSettings().catch(() => undefined)} style={{ flex: 1 }} />
            <Button label="Track manually" variant="secondary" onPress={trackManually} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.sm }} accessibilityLabel={`Elapsed time ${timeText}`}>
        {isRun ? (
          <>
            {tile("Distance", mode === "gps" ? formatKm(live.distanceM, distanceUnit) : "-")}
            {tile("Avg Pace", mode === "gps" ? paceText : "-")}
            {tile("Duration", timeText)}
          </>
        ) : (
          <>
            {tile("Speed", mode === "gps" ? paceText : "-")}
            {tile("Distance", mode === "gps" ? formatKm(live.distanceM, distanceUnit) : "-")}
            {tile("Elevation", mode === "gps" ? `+${live.elevationGainM} m` : "-")}
          </>
        )}
      </View>
      {!isRun ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {tile("Duration", timeText)}
          {tile("Cadence / Power", "No sensor")}
        </View>
      ) : null}

      <View style={{ backgroundColor: panel, borderColor: panelBorder, borderWidth: 1, borderRadius: radius.md, padding: spacing.md - 2, gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>Wearable Live HR</Text>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 11 }}>Not connected</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          ))}
        </View>
      </View>

      {isRun && mode === "gps" && phase !== "idle" ? (
        <>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Splits</Text>
          {splits.length === 0 ? (
            <Text style={{ color: colors.textMuted, ...typography.meta }}>Your first split appears after 1 km.</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {splits.map((sec, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    backgroundColor: panel,
                    borderColor: panelBorder,
                    borderWidth: 1,
                    borderRadius: radius.sm,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>Km {i + 1}</Text>
                  <Text style={{ color: colors.cyan, fontFamily: fonts.bodySemi, fontSize: 13 }}>{formatPace(sec)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}

      {isRun ? (
        <Pressable
          onPress={() => navigation.navigate("WorkoutSettings")}
          accessibilityRole="button"
          accessibilityLabel="Audio coaching is not available yet. Open preferences."
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.aiSurface, borderRadius: radius.md, paddingVertical: 11 }}
        >
          <Icon name="mic" size={14} color={colors.aiAccent} />
          <Text style={{ color: colors.aiAccent, fontFamily: fonts.bodyMedium, fontSize: 12 }}>
            Audio coaching prompts are not available yet
          </Text>
        </Pressable>
      ) : null}

      {phase === "finishing" ? (
        <Card style={{ gap: spacing.sm }}>
          {mode === "gps" ? (
            <>
              <Text style={{ color: colors.textSecondary }}>
                {formatKm(live.distanceM, distanceUnit)} in {timeText} ({paceText}){live.elevationGainM > 0 ? `, ${live.elevationGainM} m climb` : ""}
              </Text>
              {distanceError ? <Text style={{ color: colors.danger, ...typography.meta }}>{distanceError}</Text> : null}
            </>
          ) : (
            <TextField
              label={`Distance (${distanceUnit})`}
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
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.lg, paddingVertical: spacing.sm }}>
            <Pressable
              onPress={stop}
              disabled={phase === "idle" || locked}
              accessibilityRole="button"
              accessibilityLabel="Finish and save"
              style={[circle(58, colors.surface), { opacity: phase === "idle" || locked ? 0.4 : 1, borderWidth: 1, borderColor: colors.border }]}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.danger }} />
              </View>
            </Pressable>
            <Pressable
              onPress={() => centerAction?.()}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={phase === "idle" ? `Start ${label.toLowerCase()}` : phase === "running" ? "Pause" : "Resume"}
              style={[circle(76, colors.accent), { opacity: locked ? 0.5 : 1 }]}
            >
              <Icon name={phase === "running" ? "pause" : "play"} size={30} color={colors.textOnAccent} />
            </Pressable>
            <Pressable
              onPress={() => setLocked(true)}
              onLongPress={() => setLocked(false)}
              accessibilityRole="button"
              accessibilityLabel={locked ? "Controls locked. Press and hold to unlock." : "Lock controls"}
              style={[circle(58, colors.surface), { borderWidth: 1, borderColor: locked ? colors.warning : colors.border }]}
            >
              <Icon name="lock" size={20} color={locked ? colors.warning : colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>
            {locked
              ? "Controls locked. Press and hold the lock to unlock."
              : phase === "idle"
                ? `Tap play to start your ${label.toLowerCase()}.`
                : phase === "paused"
                  ? "Paused. GPS is off until you resume."
                  : "Tracking."}
          </Text>
          {phase === "idle" && mode === "gps" && perm !== "denied" ? (
            <Pressable onPress={trackManually} accessibilityRole="button" accessibilityLabel="Track manually instead" hitSlop={8}>
              <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>Track manually instead</Text>
            </Pressable>
          ) : null}
          {phase === "paused" || phase === "running" ? (
            <Pressable onPress={discard} disabled={locked} accessibilityRole="button" accessibilityLabel="Discard this session" hitSlop={8}>
              <Text style={{ color: colors.textMuted, ...typography.meta, textAlign: "center" }}>Discard session</Text>
            </Pressable>
          ) : null}
        </>
      )}

      <SegmentedControl options={RANGES} value={range} onChange={setRange} />

      {summaryQuery.isError ? (
        <ErrorState onRetry={() => summaryQuery.refetch()} />
      ) : summaryQuery.isLoading || !summary ? (
        <Skeleton height={180} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <StatTile icon="activity" label={`${label}s`} value={summary.count} />
            <StatTile icon="target" label="Distance" value={formatKm(summary.distanceMeters, distanceUnit)} tint={colors.success} tintSoft={colors.successSoft} />
            <StatTile
              icon="zap"
              label={kind === "run" ? "Avg pace" : "Avg speed"}
              value={kind === "run" ? formatPace(summary.avgPaceSecPerKm, distanceUnit) : formatSpeed(summary.avgSpeedKmh, distanceUnit)}
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
            accessibilityLabel={`${label} on ${formatDateTime(a.startedAt)}, ${formatKm(a.distanceMeters, distanceUnit)}`}
          >
            <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{formatKm(a.distanceMeters, distanceUnit)}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>{formatDateTime(a.startedAt)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: colors.textSecondary }}>{formatDuration(a.durationSeconds)}</Text>
                <Text style={{ color: colors.textMuted, ...typography.meta }}>{formatRate(a, distanceUnit)}</Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}
