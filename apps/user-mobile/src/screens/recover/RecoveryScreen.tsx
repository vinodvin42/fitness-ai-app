import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RecoveryLogItem, UpsertRecoveryInput } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { fetchRecovery, upsertRecovery } from "../../api/recovery";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Recovery">;

interface FormState {
  restingHeartRate: string;
  sleepHours: string;
  hrvMs: string;
  soreness: string;
  energyLevel: string;
  notes: string;
}

const EMPTY: FormState = { restingHeartRate: "", sleepHours: "", hrvMs: "", soreness: "", energyLevel: "", notes: "" };

function numField(value: string): number | undefined {
  const n = Number(value);
  return value.trim() !== "" && !Number.isNaN(n) ? n : undefined;
}

function fmt(value: number | null, suffix = ""): string {
  return value == null ? "—" : `${value}${suffix}`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const inputStyle = {
  color: colors.textPrimary,
  backgroundColor: colors.surface,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.border,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.sm,
} as const;

/**
 * Recovery & Devices — manual-entry stopgap (docs/mobile Phase 2 §E), added
 * 31 Aug 2026. Real self-reported metrics (resting HR / sleep / HRV /
 * soreness / energy), one row per day, with a 30-day average card and
 * recent history — honestly labelled as self-reported rather than a device
 * feed (no HealthKit/Google Fit exists here). Same "real stopgap, not a
 * faked device list" precedent as Progress Photos' base64 storage.
 */
export function RecoveryScreen({ navigation: _navigation }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["recovery"], queryFn: fetchRecovery });

  const mutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().slice(0, 10);
      const payload: UpsertRecoveryInput = {
        date: today,
        restingHeartRate: numField(form.restingHeartRate),
        sleepHours: numField(form.sleepHours),
        hrvMs: numField(form.hrvMs),
        soreness: numField(form.soreness),
        energyLevel: numField(form.energyLevel),
        notes: form.notes.trim() || undefined,
      };
      return upsertRecovery(payload);
    },
    onSuccess: () => {
      setForm(EMPTY);
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
    onError: (err) => Alert.alert("Couldn't save", extractErrorMessage(err, "Please try again.")),
  });

  const set = (key: keyof FormState, value: string) => setForm((p) => ({ ...p, [key]: value }));
  const hasAny =
    [form.restingHeartRate, form.sleepHours, form.hrvMs, form.soreness, form.energyLevel].some((v) => v.trim() !== "") ||
    form.notes.trim() !== "";

  return (
    <ScreenContainer title="Recovery">
      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ErrorState onRetry={() => refetch()} />}

      <Card>
        <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.xs }}>Log today</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginBottom: spacing.sm }}>
          Self-reported — enter what you have. Saving again updates today's entry.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <LabeledInput label="Resting HR" unit="bpm" value={form.restingHeartRate} onChange={(v) => set("restingHeartRate", v)} />
          <LabeledInput label="Sleep" unit="hrs" value={form.sleepHours} onChange={(v) => set("sleepHours", v)} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
          <LabeledInput label="HRV" unit="ms" value={form.hrvMs} onChange={(v) => set("hrvMs", v)} />
          <LabeledInput label="Soreness" unit="1-5" value={form.soreness} onChange={(v) => set("soreness", v)} />
          <LabeledInput label="Energy" unit="1-5" value={form.energyLevel} onChange={(v) => set("energyLevel", v)} />
        </View>
        <TextInput
          value={form.notes}
          onChangeText={(v) => set("notes", v)}
          placeholder="Notes (optional)"
          placeholderTextColor={colors.textMuted}
          style={{ ...inputStyle, marginTop: spacing.sm }}
        />
        <Button
          label="Save"
          onPress={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!hasAny || mutation.isPending}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      {data && (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>
            {data.rangeDays}-day averages
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
            <Metric label="Resting HR" value={fmt(data.averages.restingHeartRate, " bpm")} />
            <Metric label="Sleep" value={fmt(data.averages.sleepHours, " hrs")} />
            <Metric label="HRV" value={fmt(data.averages.hrvMs, " ms")} />
            <Metric label="Soreness" value={fmt(data.averages.soreness)} />
            <Metric label="Energy" value={fmt(data.averages.energyLevel)} />
          </View>
        </Card>
      )}

      {data && data.logs.length > 0 && (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.textPrimary, ...typography.h2, marginBottom: spacing.sm }}>Recent</Text>
          {data.logs.map((log: RecoveryLogItem) => (
            <View
              key={log.id}
              style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}
            >
              <Text style={{ color: colors.textSecondary }}>{dayLabel(log.date)}</Text>
              <Text style={{ color: colors.textPrimary, flex: 1, textAlign: "right" }}>
                {[
                  log.restingHeartRate != null ? `${log.restingHeartRate}bpm` : null,
                  log.sleepHours != null ? `${log.sleepHours}h` : null,
                  log.hrvMs != null ? `${log.hrvMs}ms` : null,
                  log.energyLevel != null ? `E${log.energyLevel}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </ScreenContainer>
  );
}

function LabeledInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
        {label} <Text style={{ color: colors.textMuted }}>({unit})</Text>
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        style={{ ...inputStyle, marginTop: 4 }}
      />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
