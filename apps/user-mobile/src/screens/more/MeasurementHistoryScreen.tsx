import React from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BodyMeasurement } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { fetchMeasurements } from "../../api/progress";
import { colors, spacing, typography } from "../../theme/tokens";
import type { ProgressStackParamList } from "../../navigation/ProgressStack";

type Props = NativeStackScreenProps<ProgressStackParamList, "MeasurementHistory">;

const ROWS: Array<{ key: keyof BodyMeasurement; label: string; unit: string }> = [
  { key: "weightKg", label: "Weight", unit: "kg" },
  { key: "chestCm", label: "Chest", unit: "cm" },
  { key: "waistCm", label: "Waist", unit: "cm" },
  { key: "hipsCm", label: "Hips", unit: "cm" },
  { key: "armsCm", label: "Arms", unit: "cm" },
  { key: "thighsCm", label: "Thighs", unit: "cm" },
];

/** Body Measurements (docs/mobile/03-screen-inventory.md §F) — a plain reverse-chronological list, not the design's body-diagram visual (no diagram asset exists yet). */
export function MeasurementHistoryScreen({ navigation }: Props) {
  const { data: measurements, isLoading, isError, refetch } = useQuery({
    queryKey: ["progress", "measurements"],
    queryFn: fetchMeasurements,
  });

  return (
    <ScreenContainer title="Measurement History" scroll={false}>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={measurements ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h2 }}>
                {new Date(item.loggedAt).toLocaleDateString()}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs }}>
                {ROWS.filter((r) => item[r.key] != null).map((r) => (
                  <Text key={r.key} style={{ color: colors.textSecondary }}>
                    {r.label}: {item[r.key] as number}
                    {r.unit}
                  </Text>
                ))}
              </View>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No measurements logged yet"
              subtitle="Log your weight and body measurements to start tracking progress."
              actionLabel="Log Measurement"
              onAction={() => navigation.navigate("LogMeasurement")}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}
