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
import { fetchDueMedications, localDateString } from "../../api/medications";
import { BRAND_NAME } from "../../lib/brand";
import { formatClockTz } from "../../lib/medicationReminder";
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

/** Today's reminders; each row opens that occurrence (Medicine 02-05). */
export function MedicineDueScreen({ navigation }: Props) {
  const date = localDateString();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["medications", "due", date],
    queryFn: () => fetchDueMedications(date),
  });
  const items = [...(data?.items ?? [])].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  return (
    <ScreenContainer
      title="Today's medicine"
      subtitle="Open a reminder to log what happened"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />}
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
          actionLabel="Manage reminders"
          onAction={() => navigation.navigate("MedicationList")}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((d) => (
            <Pressable
              key={`${d.medicationId}-${d.scheduledFor}`}
              onPress={() => navigation.navigate("MedicineOccurrence", { medicationId: d.medicationId, scheduledFor: d.scheduledFor })}
              accessibilityRole="button"
              accessibilityLabel={`${d.name}, ${formatClockTz(d.scheduledFor)}, ${dueStatusLabel(d)}. Open`}
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
                <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{formatClockTz(d.scheduledFor)}</Text>
              </View>
              <Pill label={dueStatusLabel(d)} />
              <Icon name="chevron-right" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}
      <InfoCard
        title="Reminder only"
        body={`Not medical advice. Follow your prescription exactly. Ask your prescriber or pharmacist about missed doses; ${BRAND_NAME} does not recommend dose changes.`}
      />
      <Button label="Manage reminders" variant="secondary" onPress={() => navigation.navigate("MedicationList")} />
    </ScreenContainer>
  );
}
