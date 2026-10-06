import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ConnectedDevice, DataStreamItem, DevicePermission, DeviceSyncSample } from "@fitness-ai-app/types";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BottomSheet } from "../../components/BottomSheet";
import { TextField } from "../../components/TextField";
import { Chip } from "../../components/Chip";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { ProgressRing } from "../../components/ProgressRing";
import { useToast } from "../../components/Toast";
import { fetchDataStreams, fetchDeviceSyncStatus, removeDevice, syncDevice } from "../../api/devices";
import { localDateString } from "../../api/medications";
import { extractErrorMessage } from "../../lib/apiError";
import { timeAgo } from "../../lib/format";
import { colors, fonts, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { ActionButton, RecoverShell, SectionLabel } from "./parts";

type Props = NativeStackScreenProps<RecoverStackParamList, "SyncDashboard">;

interface ImportForm {
  restingHr: string;
  sleepHours: string;
  hrvMs: string;
  steps: string;
  activeCalories: string;
  activeMinutes: string;
  spo2: string;
  stressScore: string;
  batteryPct: string;
}
const EMPTY_FORM: ImportForm = {
  restingHr: "",
  sleepHours: "",
  hrvMs: "",
  steps: "",
  activeCalories: "",
  activeMinutes: "",
  spo2: "",
  stressScore: "",
  batteryPct: "",
};

function num(v: string): number | undefined {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

const RANGES: Array<[keyof ImportForm, string, number, number, boolean]> = [
  ["restingHr", "Resting HR should be 20-220 bpm.", 20, 220, true],
  ["sleepHours", "Sleep should be 0-24 hours.", 0, 24, false],
  ["hrvMs", "HRV should be 0-400 ms.", 0, 400, true],
  ["steps", "Steps should be a whole number up to 200,000.", 0, 200000, true],
  ["activeCalories", "Active calories should be a whole number up to 20,000.", 0, 20000, true],
  ["activeMinutes", "Active minutes should be a whole number up to 1,440.", 0, 1440, true],
  ["spo2", "SpO2 should be 50-100%.", 50, 100, true],
  ["stressScore", "Stress should be 0-100.", 0, 100, true],
  ["batteryPct", "Battery should be 0-100%.", 0, 100, true],
];

function buildSample(form: ImportForm): { sample?: DeviceSyncSample; batteryPct?: number; error?: string } {
  const v = Object.fromEntries((Object.keys(form) as Array<keyof ImportForm>).map((k) => [k, num(form[k])])) as Record<
    keyof ImportForm,
    number | undefined
  >;
  const hasMetric = (Object.keys(v) as Array<keyof ImportForm>).some((k) => k !== "batteryPct" && v[k] !== undefined);
  if (!hasMetric) return { error: "Enter at least one value to import." };
  for (const [key, msg, min, max, whole] of RANGES) {
    const x = v[key];
    if (x !== undefined && (x < min || x > max || (whole && !Number.isInteger(x)))) return { error: msg };
  }
  return {
    sample: {
      date: localDateString(),
      restingHr: v.restingHr,
      sleepHours: v.sleepHours,
      hrvMs: v.hrvMs,
      steps: v.steps,
      activeCalories: v.activeCalories,
      activeMinutes: v.activeMinutes,
      spo2: v.spo2,
      stressScore: v.stressScore,
    },
    batteryPct: v.batteryPct,
  };
}

/** Which permission each sample field needs - used to warn about values the server will drop. */
const FIELD_PERM: Array<[keyof DeviceSyncSample, DevicePermission]> = [
  ["restingHr", "heart_rate"],
  ["hrvMs", "heart_rate"],
  ["sleepHours", "sleep"],
  ["steps", "steps"],
  ["activeCalories", "workouts"],
  ["activeMinutes", "workouts"],
  ["spo2", "spo2"],
  ["stressScore", "stress"],
];

function formatStream(item: DataStreamItem): string {
  if (item.value == null) return "—";
  const sameDay = item.date ? new Date(item.date).toISOString().slice(0, 10) === localDateString() : false;
  switch (item.key) {
    case "steps":
      return `${item.value.toLocaleString()}${sameDay ? " today" : ""}`;
    case "heart_rate":
      return `${item.value} bpm`;
    case "sleep": {
      const mins = Math.round(item.value * 60);
      return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
    }
    case "calories":
      return `${item.value.toLocaleString()} kcal`;
    case "spo2":
      return `${item.value}%`;
    case "weight":
      return `${item.value} kg`;
  }
}

function streamSub(item: DataStreamItem): string {
  if (item.value == null) return "No data yet";
  const iso = item.date ? new Date(item.date).toISOString().slice(0, 10) : null;
  const when = !iso
    ? ""
    : iso === localDateString()
      ? "today"
      : new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const label = item.key === "heart_rate" ? "resting" : null;
  const src = item.source === "device" ? item.deviceName ?? "Device" : "Manual entry";
  return [src, label, when].filter(Boolean).join(" · ");
}

/** Recover 05 - Data & Sync. */
export function SyncDashboardScreen({ navigation, route }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const status = useQuery({ queryKey: ["devices", "sync-status"], queryFn: fetchDeviceSyncStatus });
  const streams = useQuery({ queryKey: ["devices", "streams"], queryFn: fetchDataStreams });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [form, setForm] = useState<ImportForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const devices = (status.data ?? []).map((x) => x.device);
  const target = devices.find((d) => d.id === targetId) ?? null;

  const openImport = (id?: string) => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setTargetId(id ?? devices[0]?.id ?? null);
    setSheetOpen(true);
  };

  // Deep link from the device sync buttons.
  const importDeviceId = route.params?.importDeviceId;
  useEffect(() => {
    if (importDeviceId && devices.some((d) => d.id === importDeviceId) && !sheetOpen) {
      setForm(EMPTY_FORM);
      setFormError(null);
      setTargetId(importDeviceId);
      setSheetOpen(true);
      navigation.setParams({ importDeviceId: undefined });
    }
  }, [importDeviceId, status.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["devices"] });
    queryClient.invalidateQueries({ queryKey: ["recovery"] });
  };

  const syncMutation = useMutation({
    mutationFn: (v: { device: ConnectedDevice; sample: DeviceSyncSample; batteryPct?: number }) =>
      syncDevice(v.device.id, { samples: [v.sample], batteryPct: v.batteryPct }),
    onSuccess: (_res, v) => {
      refresh();
      setSheetOpen(false);
      setForm(EMPTY_FORM);
      const blocked = FIELD_PERM.some(([f, p]) => v.sample[f] !== undefined && !v.device.permissions.includes(p));
      toast.show(blocked ? "Imported - some values skipped (not permitted for this device)" : "Values imported", blocked ? "info" : "success");
    },
    onError: (err) => setFormError(extractErrorMessage(err, "Couldn't import. Try again.")),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeDevice(id),
    onSuccess: () => {
      refresh();
      toast.show("Device removed", "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't remove this device."), "error"),
  });

  const submit = () => {
    if (!target) return;
    const built = buildSample(form);
    if (built.error || !built.sample) {
      setFormError(built.error ?? "Check your values.");
      return;
    }
    setFormError(null);
    syncMutation.mutate({ device: target, sample: built.sample, batteryPct: built.batteryPct });
  };
  const set = (key: keyof ImportForm) => (v: string) => setForm((p) => ({ ...p, [key]: v }));

  const runs = status.data ?? [];
  const lastSyncAt = devices.map((d) => d.lastSyncAt).filter(Boolean).sort().pop() ?? null;
  const healthy = runs.filter(
    (x) => x.latestRun?.status === "success" && x.device.lastSyncAt && Date.now() - new Date(x.device.lastSyncAt).getTime() < 86_400_000,
  ).length;
  const pct = devices.length ? Math.round((healthy / devices.length) * 100) : 0;

  return (
    <RecoverShell centered title="Data & Sync" onBack={() => navigation.goBack()}>
      {status.isLoading ? (
        <SkeletonCard lines={3} />
      ) : status.isError ? (
        <ErrorState message="Couldn't load sync status." onRetry={() => status.refetch()} />
      ) : (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h2 }}>Sync Health</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>
              {devices.length === 0 ? "No devices connected" : `Last sync: ${timeAgo(lastSyncAt)}`}
            </Text>
            <ActionButton
              label={devices.length === 0 ? "Add a device" : "Sync All Now"}
              onPress={() => (devices.length === 0 ? navigation.navigate("AddDevice") : openImport())}
              style={{ height: 34, alignSelf: "flex-start", paddingHorizontal: spacing.md, marginTop: 4 }}
            />
          </View>
          <ProgressRing progress={pct / 100} size={64} strokeWidth={6} color={colors.success}>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.monoSemi, fontSize: 13 }}>{pct}%</Text>
          </ProgressRing>
        </Card>
      )}
      {devices.length > 0 ? (
        <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }}>
          Sync All Now opens the manual import: this build can&apos;t pull from devices automatically, so you enter what each
          device shows. The ring is the share of devices that synced successfully in the last 24 hours.
        </Text>
      ) : null}

      <SectionLabel small>Data Streams</SectionLabel>
      {streams.isLoading ? (
        <SkeletonCard lines={4} />
      ) : streams.isError ? (
        <ErrorState message="Couldn't load your data streams." onRetry={() => streams.refetch()} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {(streams.data ?? []).map((item) => {
            const dot = item.value == null ? colors.textMuted : item.stale || item.source !== "device" ? colors.warning : colors.success;
            return (
              <Card key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm + 4 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{item.label}</Text>
                  <Text style={{ color: colors.textMuted, ...typography.meta, fontSize: 11 }} numberOfLines={1}>
                    {streamSub(item)}
                  </Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.monoSemi, fontSize: 13 }}>{formatStream(item)}</Text>
              </Card>
            );
          })}
        </View>
      )}

      {devices.length > 0 ? (
        <>
          <SectionLabel small>Devices</SectionLabel>
          {runs.map(({ device, latestRun }) => (
            <Card key={device.id} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{device.name}</Text>
                <Text style={{ color: latestRun?.status === "error" ? colors.danger : colors.textMuted, ...typography.meta }}>
                  {latestRun
                    ? latestRun.status === "success"
                      ? `Last sync ${timeAgo(latestRun.finishedAt ?? latestRun.startedAt)} · ${latestRun.recordsIngested} record${latestRun.recordsIngested === 1 ? "" : "s"}`
                      : "Last sync failed"
                    : "Never synced"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <ActionButton label="Import values" onPress={() => openImport(device.id)} style={{ flex: 1, height: 38 }} />
                <ActionButton
                  label="Remove"
                  variant="dark"
                  onPress={() =>
                    Alert.alert("Remove device?", `${device.name} will be removed from your account.`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: () => removeMutation.mutate(device.id) },
                    ])
                  }
                  style={{ flex: 1, height: 38 }}
                />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Import today's values">
        {devices.length > 1 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {devices.map((d) => (
              <Chip key={d.id} label={d.name} selected={d.id === targetId} onPress={() => setTargetId(d.id)} />
            ))}
          </View>
        ) : null}
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          Enter what {target ? target.name : "your device"} shows for today. Leave blank anything you don&apos;t have. Values
          the device isn&apos;t permitted to supply are skipped.
        </Text>
        <TextField label="Steps" value={form.steps} onChangeText={set("steps")} keyboardType="numeric" />
        <TextField label="Active calories (kcal)" value={form.activeCalories} onChangeText={set("activeCalories")} keyboardType="numeric" />
        <TextField label="Active minutes" value={form.activeMinutes} onChangeText={set("activeMinutes")} keyboardType="numeric" />
        <TextField label="Resting HR (bpm)" value={form.restingHr} onChangeText={set("restingHr")} keyboardType="numeric" />
        <TextField label="Sleep (hours)" value={form.sleepHours} onChangeText={set("sleepHours")} keyboardType="decimal-pad" />
        <TextField label="HRV (ms)" value={form.hrvMs} onChangeText={set("hrvMs")} keyboardType="numeric" />
        <TextField label="Blood oxygen SpO2 (%)" value={form.spo2} onChangeText={set("spo2")} keyboardType="numeric" />
        <TextField label="Stress score (0-100)" value={form.stressScore} onChangeText={set("stressScore")} keyboardType="numeric" />
        <TextField label="Battery (%) - optional" value={form.batteryPct} onChangeText={set("batteryPct")} keyboardType="numeric" />
        {formError ? <Text style={{ color: colors.danger, ...typography.meta }}>{formError}</Text> : null}
        <Button label="Import values" loading={syncMutation.isPending} onPress={submit} />
      </BottomSheet>
    </RecoverShell>
  );
}

