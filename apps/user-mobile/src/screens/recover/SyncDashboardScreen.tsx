import React, { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ConnectedDevice, DeviceSyncRun, DeviceSyncSample } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { BottomSheet } from "../../components/BottomSheet";
import { TextField } from "../../components/TextField";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";
import { fetchDeviceSyncStatus, removeDevice, syncDevice } from "../../api/devices";
import { localDateString } from "../../api/medications";
import { extractErrorMessage } from "../../lib/apiError";
import { PROVIDER_LABEL, timeAgo } from "../../lib/format";
import { colors, spacing, typography } from "../../theme/tokens";
import type { RecoverStackParamList } from "../../navigation/RecoverStack";
import { DeviceRow } from "./ConnectedDevicesScreen";

type Props = NativeStackScreenProps<RecoverStackParamList, "SyncDashboard">;

interface ImportForm {
  restingHr: string;
  sleepHours: string;
  hrvMs: string;
  steps: string;
  batteryPct: string;
}
const EMPTY_FORM: ImportForm = { restingHr: "", sleepHours: "", hrvMs: "", steps: "", batteryPct: "" };

function num(v: string): number | undefined {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

/** Returns an error string, or null when the form is valid; builds the sample on success via `out`. */
function buildSample(form: ImportForm): { sample?: DeviceSyncSample; batteryPct?: number; error?: string } {
  const restingHr = num(form.restingHr);
  const sleepHours = num(form.sleepHours);
  const hrvMs = num(form.hrvMs);
  const steps = num(form.steps);
  const batteryPct = num(form.batteryPct);
  if (restingHr === undefined && sleepHours === undefined && hrvMs === undefined && steps === undefined) {
    return { error: "Enter at least one value to import." };
  }
  if (restingHr !== undefined && (restingHr < 20 || restingHr > 250)) return { error: "Resting HR should be 20-250 bpm." };
  if (sleepHours !== undefined && (sleepHours < 0 || sleepHours > 24)) return { error: "Sleep should be 0-24 hours." };
  if (hrvMs !== undefined && (hrvMs < 0 || hrvMs > 500)) return { error: "HRV should be 0-500 ms." };
  if (steps !== undefined && (steps < 0 || !Number.isInteger(steps))) return { error: "Steps should be a whole number." };
  if (batteryPct !== undefined && (batteryPct < 0 || batteryPct > 100)) return { error: "Battery should be 0-100%." };
  return {
    sample: { date: localDateString(), restingHr, sleepHours, hrvMs, steps },
    batteryPct,
  };
}

function runLine(run: DeviceSyncRun | null): string {
  if (!run) return "No syncs recorded yet";
  const when = timeAgo(run.finishedAt ?? run.startedAt);
  return run.status === "success"
    ? `Last sync ${when} · ${run.recordsIngested} record${run.recordsIngested === 1 ? "" : "s"}`
    : `Last sync failed ${when}`;
}

/** Recover 05 - Sync Dashboard. Per-device sync health plus a manual "import today's values" path. */
export function SyncDashboardScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["devices", "sync-status"],
    queryFn: fetchDeviceSyncStatus,
  });
  const [target, setTarget] = useState<ConnectedDevice | null>(null);
  const [form, setForm] = useState<ImportForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["devices"] });
    queryClient.invalidateQueries({ queryKey: ["recovery"] });
  };

  const syncMutation = useMutation({
    mutationFn: (v: { id: string; sample: DeviceSyncSample; batteryPct?: number }) =>
      syncDevice(v.id, { samples: [v.sample], batteryPct: v.batteryPct }),
    onSuccess: () => {
      refresh();
      setTarget(null);
      setForm(EMPTY_FORM);
      toast.show("Values imported", "success");
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

  const openImport = (d: ConnectedDevice) => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setTarget(d);
  };

  const submit = () => {
    if (!target) return;
    const built = buildSample(form);
    if (built.error || !built.sample) {
      setFormError(built.error ?? "Check your values.");
      return;
    }
    setFormError(null);
    syncMutation.mutate({ id: target.id, sample: built.sample, batteryPct: built.batteryPct });
  };

  const set = (key: keyof ImportForm) => (v: string) => setForm((p) => ({ ...p, [key]: v }));

  return (
    <ScreenContainer title="Sync dashboard" subtitle="Per-device sync health">
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <SkeletonCard lines={3} />
      ) : isError ? (
        <ErrorState message="Couldn't load sync status." onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Nothing to sync"
          subtitle="Add a device first. Sync history appears here once it has synced."
          actionLabel="Add device"
          onAction={() => navigation.navigate("AddDevice")}
        />
      ) : (
        (data ?? []).map(({ device, latestRun }) => (
          <View key={device.id} style={{ gap: spacing.sm }}>
            <DeviceRow device={device} />
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Pill
                  label={latestRun ? (latestRun.status === "success" ? "Last sync OK" : "Last sync failed") : "Never synced"}
                  tone={latestRun ? (latestRun.status === "success" ? "success" : "danger") : "neutral"}
                />
                <Text style={{ color: colors.textSecondary, ...typography.meta, flex: 1 }}>{runLine(latestRun)}</Text>
              </View>
              <Text style={{ color: colors.textMuted, ...typography.meta }}>
                {PROVIDER_LABEL[device.provider] ?? device.provider} can't push data to this build automatically. Sync now
                records the values you enter.
              </Text>
              <Button label="Sync now" onPress={() => openImport(device)} />
              <Button
                label="Remove device"
                variant="secondary"
                loading={removeMutation.isPending && removeMutation.variables === device.id}
                onPress={() =>
                  Alert.alert("Remove device?", `${device.name} will be removed from your account.`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => removeMutation.mutate(device.id) },
                  ])
                }
              />
            </Card>
          </View>
        ))
      )}

      <BottomSheet visible={target != null} onClose={() => setTarget(null)} title="Import today's values">
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          Enter what your {target ? PROVIDER_LABEL[target.provider] ?? target.name : "device"} shows for today. Leave
          blank anything you don't have.
        </Text>
        <TextField label="Resting HR (bpm)" value={form.restingHr} onChangeText={set("restingHr")} keyboardType="numeric" />
        <TextField label="Sleep (hours)" value={form.sleepHours} onChangeText={set("sleepHours")} keyboardType="decimal-pad" />
        <TextField label="HRV (ms)" value={form.hrvMs} onChangeText={set("hrvMs")} keyboardType="numeric" />
        <TextField label="Steps" value={form.steps} onChangeText={set("steps")} keyboardType="numeric" />
        <TextField label="Battery (%) - optional" value={form.batteryPct} onChangeText={set("batteryPct")} keyboardType="numeric" />
        {formError ? <Text style={{ color: colors.danger, ...typography.meta }}>{formError}</Text> : null}
        <Button label="Import values" loading={syncMutation.isPending} onPress={submit} />
      </BottomSheet>
    </ScreenContainer>
  );
}
