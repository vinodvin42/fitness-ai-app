import React, { useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { HealthReading } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { SectionHeader } from "../../components/SectionHeader";
import { SegmentedControl } from "../../components/SegmentedControl";
import { SkeletonCard } from "../../components/Skeleton";
import { addHealthReading, fetchHealthReadings, HEALTHSPAN_KEY } from "../../api/healthspan";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, themed } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "HealthReadings">;
type Kind = HealthReading["kind"];

const inputStyle = themed(() => ({
  color: colors.textPrimary,
  backgroundColor: colors.surfaceRaised,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  paddingHorizontal: spacing.md,
  height: 52,
  fontFamily: fonts.displaySemi,
  fontSize: 20,
}));

function NumberField({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        {label} <Text style={{ color: colors.textMuted }}>({unit})</Text>
      </Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="—" placeholderTextColor={colors.textMuted} style={inputStyle} accessibilityLabel={label} />
    </View>
  );
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Blood pressure and VO2max readings (25 Oct 2026): type one in, or let
 * Health Connect sync them; the latest feed heart age and fitness age.
 */
export function HealthReadingsScreen({ navigation, route }: Props) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>(route.params?.kind ?? "blood_pressure");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [vo2, setVo2] = useState("");
  const list = useQuery({ queryKey: ["healthspan", "readings", kind], queryFn: () => fetchHealthReadings(kind) });

  const save = useMutation({
    mutationFn: () =>
      kind === "blood_pressure"
        ? addHealthReading({ kind, systolic: Number(systolic), diastolic: Number(diastolic) })
        : addHealthReading({ kind, vo2max: Number(vo2) }),
    onSuccess: async () => {
      setSystolic("");
      setDiastolic("");
      setVo2("");
      await queryClient.invalidateQueries({ queryKey: HEALTHSPAN_KEY });
    },
    onError: (err) => Alert.alert("Couldn't save", extractErrorMessage(err, "Check the numbers and try again.")),
  });

  const sys = Number(systolic);
  const dia = Number(diastolic);
  const bpValid = Number.isInteger(sys) && Number.isInteger(dia) && sys >= 70 && sys <= 260 && dia >= 40 && dia <= 160 && sys > dia;
  const v = Number(vo2);
  const vo2Valid = vo2.trim() !== "" && v >= 10 && v <= 90;
  const valid = kind === "blood_pressure" ? bpValid : vo2Valid;

  return (
    <ScreenContainer title="Readings" subtitle="Blood pressure and VO₂max" onBack={() => navigation.goBack()}>
      <SegmentedControl
        options={[
          { value: "blood_pressure", label: "Blood pressure" },
          { value: "vo2max", label: "VO₂max" },
        ]}
        value={kind}
        onChange={setKind}
      />

      <Card style={{ gap: spacing.md }}>
        {kind === "blood_pressure" ? (
          <>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <NumberField label="Top number" unit="systolic" value={systolic} onChange={setSystolic} />
              <NumberField label="Bottom number" unit="diastolic" value={diastolic} onChange={setDiastolic} />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Sit quietly for 5 minutes first, arm supported at heart level. Heart age uses the average of your readings from the latest month.
            </Text>
          </>
        ) : (
          <>
            <NumberField label="VO₂max" unit="mL/kg/min" value={vo2} onChange={setVo2} />
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Many watches show this as VO₂max or cardio fitness. A reading replaces the estimate in your fitness age.
            </Text>
          </>
        )}
        <Button label="Save reading" size="compact" onPress={() => save.mutate()} loading={save.isPending} disabled={!valid || save.isPending} />
      </Card>

      <SectionHeader title="Recent" />
      {list.isLoading ? (
        <SkeletonCard lines={3} />
      ) : list.isError ? (
        <ErrorState message="Couldn't load your readings." onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>No readings yet. Add one above, or connect Health Connect.</Text>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {(list.data ?? []).map((r, i) => (
            <View
              key={r.id}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.displaySemi, fontSize: 17 }}>
                  {r.kind === "blood_pressure" ? `${r.systolic}/${r.diastolic}` : `${r.vo2max}`}
                  <Text style={{ color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 }}>{r.kind === "blood_pressure" ? " mmHg" : " mL/kg/min"}</Text>
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{when(r.measuredAt)}</Text>
              </View>
              <View style={{ borderRadius: radius.xs, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.surfaceRaised }}>
                <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{r.source === "device" ? r.deviceName ?? "Device" : "You"}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScreenContainer>
  );
}
