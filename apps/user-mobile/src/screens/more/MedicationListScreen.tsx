import React, { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Medication } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Pill } from "../../components/Pill";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchMedicationAdherence, fetchMedications } from "../../api/medications";
import { syncMedicationNotifications } from "../../lib/medicationNotifications";
import { formatClock } from "../../lib/format";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MedicationList">;

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysLabel(days: number[]): string {
  if (days.length === 7) return "Every day";
  return [...days].sort().map((d) => DAY_SHORT[d]).join(", ");
}

function AdherenceLine({ medicationId }: { medicationId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["medications", "adherence", medicationId],
    queryFn: () => fetchMedicationAdherence(medicationId),
  });
  if (isLoading) return <Text style={{ color: colors.textMuted, ...typography.meta }}>Loading adherence...</Text>;
  if (isError || !data) return null;
  if (data.adherencePct == null) {
    return <Text style={{ color: colors.textMuted, ...typography.meta }}>Adherence appears after your first scheduled dose.</Text>;
  }
  return (
    <Text style={{ color: colors.textSecondary, ...typography.meta }}>
      Last {data.days} days: {data.adherencePct}% taken · {data.taken} taken, {data.skipped} skipped, {data.missed} missed
    </Text>
  );
}

function MedicationCard({ med, onPress }: { med: Medication; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${med.name}, ${med.dosage}. Edit`}>
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: "rgba(236,72,153,0.16)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="pill" size={20} color={colors.pink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{med.name}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>
              {med.dosage}
              {med.form ? ` · ${med.form}` : ""}
            </Text>
          </View>
          {!med.isActive ? <Pill label="Paused" /> : null}
          <Icon name="chevron-right" size={20} color={colors.textMuted} />
        </View>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          {med.scheduleTimes.map(formatClock).join(", ")} · {daysLabel(med.daysOfWeek)}
        </Text>
        <AdherenceLine medicationId={med.id} />
      </Card>
    </Pressable>
  );
}

/** Medicine - medication list with a 30-day adherence summary per item. */
export function MedicationListScreen({ navigation }: Props) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["medications"], queryFn: fetchMedications });

  // Keep the on-device schedule in step with the server list (best-effort).
  useEffect(() => {
    if (data) syncMedicationNotifications(data).catch(() => undefined);
  }, [data]);

  return (
    <ScreenContainer title="Medicine" subtitle="Reminders only, not medical advice">
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <SkeletonCard lines={3} />
      ) : isError ? (
        <ErrorState message="Couldn't load your medication." onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No medication reminders"
          subtitle="Add what you take and when, and we'll remind you. Follow your prescription exactly."
          actionLabel="Add medication"
          onAction={() => navigation.navigate("MedicationForm")}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {(data ?? []).map((m) => (
            <MedicationCard key={m.id} med={m} onPress={() => navigation.navigate("MedicationForm", { medication: m })} />
          ))}
          <Button label="Today's doses" onPress={() => navigation.navigate("MedicineDue")} />
          <Button label="Add medication" variant="secondary" onPress={() => navigation.navigate("MedicationForm")} />
        </View>
      )}
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        Lock-screen alerts are generic and never show a medicine name or dose. Ask your prescriber or pharmacist about
        missed doses; 23PrimeFit doesn't recommend dose changes.
      </Text>
    </ScreenContainer>
  );
}
