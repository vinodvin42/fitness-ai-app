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
import { fetchDueMedications, fetchMedicationAdherence, fetchMedications, localDateString } from "../../api/medications";
import { dueStatusLabel } from "./MedicineDueScreen";
import { formatClockTz, splitMedicationNotes, MEAL_LABEL } from "../../lib/medicationReminder";
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
  if (isLoading) return <Text style={{ color: colors.textMuted, ...typography.meta }}>Loading history...</Text>;
  if (isError || !data) return null;
  if (data.taken + data.skipped + data.missed === 0) {
    return <Text style={{ color: colors.textMuted, ...typography.meta }}>Your history appears after your first scheduled reminder.</Text>;
  }
  return (
    <Text style={{ color: colors.textSecondary, ...typography.meta }}>
      Last {data.days} days: {data.taken} taken, {data.skipped} skipped, {data.missed} not logged
    </Text>
  );
}

function MedicationCard({ med, onPress }: { med: Medication; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${[med.name, med.dosage].filter(Boolean).join(", ")}. Edit`}>
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
              {[med.dosage, med.form, splitMedicationNotes(med).mealTiming ? MEAL_LABEL[splitMedicationNotes(med).mealTiming!] : ""]
                .filter(Boolean)
                .join(" · ") || "No dose entered"}
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
  const date = localDateString();
  const { data: due } = useQuery({
    queryKey: ["medications", "due", date],
    queryFn: () => fetchDueMedications(date),
  });
  // Doses still needing a decision today; tapping one opens its occurrence (Medicine 02-05).
  const open = (due?.items ?? []).filter((d) => d.status === "pending" || d.status === "missed" || d.status === "snoozed");

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
          title="No medicine reminders"
          subtitle="Add what you take and when, and we'll remind you. Follow your prescription exactly."
          actionLabel="Add reminder"
          onAction={() => navigation.navigate("MedicationForm")}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {open.length > 0 ? (
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Due today</Text>
              {open.map((d) => (
                <Pressable
                  key={`${d.medicationId}-${d.scheduledFor}`}
                  onPress={() => navigation.navigate("MedicineOccurrence", { medicationId: d.medicationId, scheduledFor: d.scheduledFor })}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.name}, ${formatClockTz(d.scheduledFor)}, ${dueStatusLabel(d)}. Open`}
                  style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 4 }}
                >
                  <Icon name="bell" size={16} color={colors.accent} />
                  <Text style={{ flex: 1, color: colors.textPrimary, ...typography.label }}>
                    {d.name} · {formatClockTz(d.scheduledFor)}
                  </Text>
                  <Pill label={dueStatusLabel(d)} />
                  <Icon name="chevron-right" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </Card>
          ) : null}
          {(data ?? []).map((m) => (
            <MedicationCard key={m.id} med={m} onPress={() => navigation.navigate("MedicationForm", { medication: m })} />
          ))}
          <Button label="Today's doses" onPress={() => navigation.navigate("MedicineDue")} />
          <Button label="Add reminder" variant="secondary" onPress={() => navigation.navigate("MedicationForm")} />
        </View>
      )}
      <Text style={{ color: colors.textMuted, ...typography.meta }}>
        Lock-screen alerts are generic unless you turn on Detailed Preview for a reminder. Ask your prescriber or pharmacist about
        missed doses; 23PrimeFit doesn't recommend dose changes.
      </Text>
    </ScreenContainer>
  );
}
