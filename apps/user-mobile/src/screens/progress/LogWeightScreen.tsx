import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { fetchMeasurements, fetchProgressOverview, logMeasurement } from "../../api/progress";
import { HEALTHSPAN_KEY } from "../../api/healthspan";
import { extractErrorMessage } from "../../lib/apiError";
import { useMeasureUnits } from "../../lib/measureUnits";
import { colors, fonts, radius, spacing } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "LogWeight">;

const MIN_KG = 20;
const MAX_KG = 300;

/**
 * Log weight (owner, 25 Oct 2026: "Log weight" opened the full measurements
 * form). One number for today in the member's own unit, with the last
 * weigh-in and the goal for context; the full form stays one tap away.
 * Saves a body measurement with just the weight (POST /measurements).
 */
export function LogWeightScreen({ navigation }: Props) {
  const units = useMeasureUnits();
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const measurements = useQuery({ queryKey: ["progress", "measurements"], queryFn: fetchMeasurements });
  const overview = useQuery({ queryKey: ["progress", "overview"], queryFn: fetchProgressOverview });

  const last = (measurements.data ?? [])
    .filter((m) => m.weightKg != null)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0];
  const goalKg = overview.data?.goal?.targetWeightKg ?? null;

  const n = Number(value.replace(",", "."));
  const kg = value.trim() !== "" && Number.isFinite(n) ? units.toKg(n) : null;
  const valid = kg != null && kg >= MIN_KG && kg <= MAX_KG;
  const change = valid && last?.weightKg != null ? units.wt(kg as number) - units.wt(last.weightKg) : null;

  const save = useMutation({
    mutationFn: () => logMeasurement({ weightKg: Math.round((kg as number) * 10) / 10 }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["progress"] }), queryClient.invalidateQueries({ queryKey: HEALTHSPAN_KEY })]);
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't save your weight", extractErrorMessage(err, "Please try again.")),
  });

  return (
    <ScreenContainer title="Log weight" subtitle={`Today · ${new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`} onBack={() => navigation.goBack()}>
      <Card style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
          <TextInput
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder={last?.weightKg != null ? String(units.wt(last.weightKg)) : "0.0"}
            placeholderTextColor={colors.textMuted}
            autoFocus
            accessibilityLabel={`Weight in ${units.wtUnit}`}
            style={{ color: colors.textPrimary, fontFamily: fonts.displayBold, fontSize: 48, width: 170, textAlign: "right", paddingVertical: 0 }}
          />
          <Text style={{ color: colors.textSecondary, fontFamily: fonts.displaySemi, fontSize: 20 }}>{units.wtUnit}</Text>
        </View>
        <Text style={{ color: change == null ? colors.textMuted : colors.textSecondary, fontSize: 14 }}>
          {change == null
            ? "Weigh at the same time each day, ideally after waking."
            : Math.abs(change) < 0.05
              ? "Same as your last weigh-in"
              : `${change < 0 ? "↓" : "↑"} ${Math.abs(change).toFixed(1)} ${units.wtUnit} since your last weigh-in`}
        </Text>
        {value.trim() !== "" && !valid ? (
          <Text style={{ color: colors.dangerText, fontSize: 13 }}>
            Enter a weight between {units.wt(MIN_KG)} and {units.wt(MAX_KG)} {units.wtUnit}.
          </Text>
        ) : null}
      </Card>

      <Card style={{ paddingVertical: spacing.xs }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Last weigh-in</Text>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>
            {last?.weightKg != null
              ? `${units.wt(last.weightKg)} ${units.wtUnit} · ${new Date(last.loggedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
              : "None yet"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Goal</Text>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>{goalKg != null ? `${units.wt(goalKg)} ${units.wtUnit}` : "Not set"}</Text>
        </View>
      </Card>

      <Button label="Save weight" onPress={() => save.mutate()} loading={save.isPending} disabled={!valid || save.isPending} />

      <Pressable
        onPress={() => navigation.navigate("LogMeasurement")}
        accessibilityRole="button"
        accessibilityLabel="Log other body measurements"
        hitSlop={8}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm, borderRadius: radius.md }}
      >
        <Icon name="ruler" size={16} color={theme.accentText} />
        <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 14 }}>Log other measurements ›</Text>
      </Pressable>
    </ScreenContainer>
  );
}
