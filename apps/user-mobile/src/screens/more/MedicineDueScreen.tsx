import React from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MedicationDueDose } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Pill } from "../../components/Pill";
import { SkeletonCard } from "../../components/Skeleton";
import { InfoCard } from "../../components/StatePanels";
import { fetchDueMedications, fetchMedications, localDateString } from "../../api/medications";
import { BRAND_NAME } from "../../lib/brand";
import { MEAL_LABEL, formatClockTz, splitMedicationNotes } from "../../lib/medicationReminder";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MedicineDue">;

export const DUE_STATUS_LABEL: Record<MedicationDueDose["status"], string> = {
  pending: "Due",
  missed: "Not logged",
  snoozed: "Snoozed",
  taken: "Taken",
  skipped: "Skipped",
};

/** Pill/row label; a pending dose whose time hasn't arrived yet reads "Upcoming". */
export function dueStatusLabel(d: MedicationDueDose): string {
  if (d.status === "pending" && new Date(d.scheduledFor).getTime() > Date.now()) return "Upcoming";
  return DUE_STATUS_LABEL[d.status];
}

/** Chip colour for a dose (Figma medicine/06): taken is green, due or snoozed blue, not logged amber, the rest quiet. */
export function dueStatusTone(d: MedicationDueDose): "success" | "accent" | "warning" | "neutral" {
  switch (d.status) {
    case "taken":
      return "success";
    case "missed":
      return "warning";
    case "snoozed":
      return "accent";
    case "pending":
      return new Date(d.scheduledFor).getTime() > Date.now() ? "neutral" : "accent";
    default:
      return "neutral";
  }
}

const dayHeading = (d: Date, prefix: string) =>
  `${prefix} · ${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`;

/**
 * Today's reminders; each row opens that occurrence (Medicine 02-05).
 * 25 Oct 2026 (Figma medicine/06 "My reminders and missed"): rows show their
 * meal timing and a coloured status chip, doses left unlogged yesterday are
 * listed so they can still be looked at (never a catch-up suggestion: the
 * reminder-only note stays), and "Add reminder" sits beside "Manage reminders".
 */
export function MedicineDueScreen({ navigation }: Props) {
  const date = localDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["medications", "due", date],
    queryFn: () => fetchDueMedications(date),
  });
  const earlier = useQuery({
    queryKey: ["medications", "due", localDateString(yesterday)],
    queryFn: () => fetchDueMedications(localDateString(yesterday)),
  });
  const meds = useQuery({ queryKey: ["medications"], queryFn: fetchMedications });
  const mealLabel = new Map(
    (meds.data ?? []).flatMap((m) => {
      const timing = splitMedicationNotes(m).mealTiming;
      return timing ? [[m.id, MEAL_LABEL[timing]] as const] : [];
    }),
  );
  const items = [...(data?.items ?? [])].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const missedYesterday = (earlier.data?.items ?? [])
    .filter((d) => d.status === "missed")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  const row = (d: MedicationDueDose, sub: string) => (
    <Pressable
      key={`${d.medicationId}-${d.scheduledFor}`}
      onPress={() => navigation.navigate("MedicineOccurrence", { medicationId: d.medicationId, scheduledFor: d.scheduledFor })}
      accessibilityRole="button"
      accessibilityLabel={`${d.name}, ${sub}, ${dueStatusLabel(d)}. Open`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.card,
        padding: spacing.md,
      }}
    >
      <Icon name="pill" size={20} color={colors.pink} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{d.name}</Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{sub}</Text>
      </View>
      <Pill label={dueStatusLabel(d)} tone={dueStatusTone(d)} />
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
  const timeAndMeal = (d: MedicationDueDose) => [formatClockTz(d.scheduledFor), mealLabel.get(d.medicationId)].filter(Boolean).join(" · ");

  return (
    <ScreenContainer
      title="Today's medicine"
      subtitle="Open a reminder to log what happened"
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => {
            refetch();
            earlier.refetch();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <SkeletonCard lines={3} />
      ) : isError ? (
        <ErrorState message="Couldn't load today's reminders." onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing due today"
          subtitle="Reminders scheduled for today will appear here."
          actionLabel="Add reminder"
          onAction={() => navigation.navigate("MedicationForm")}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>{dayHeading(new Date(), "Today")}</Text>
          {items.map((d) => row(d, timeAndMeal(d)))}
        </View>
      )}

      {missedYesterday.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.textMuted, ...typography.meta }}>{dayHeading(yesterday, "Yesterday")}</Text>
          {missedYesterday.map((d) => row(d, `Yesterday ${timeAndMeal(d)}`))}
        </View>
      ) : null}

      <InfoCard
        title="Reminder only"
        body={`Not medical advice. Follow your prescription exactly. Ask your prescriber or pharmacist about missed doses; ${BRAND_NAME} does not recommend dose changes.`}
      />
      {items.length > 0 ? <Button label="Add reminder" onPress={() => navigation.navigate("MedicationForm")} /> : null}
      <Button label="Manage reminders" variant="secondary" onPress={() => navigation.navigate("MedicationList")} />
    </ScreenContainer>
  );
}
