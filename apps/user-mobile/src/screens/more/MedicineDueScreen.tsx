import React from "react";
import { Platform, RefreshControl, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MedicationDoseStatus, MedicationDueDose } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { Icon, IconName } from "../../components/Icon";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { InfoCard } from "../../components/StatePanels";
import { useToast } from "../../components/Toast";
import { fetchDueMedications, localDateString, logMedicationDose } from "../../api/medications";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MedicineDue">;

const SNOOZE_MINUTES = 10;

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface Look {
  flow: string;
  icon: IconName;
  tint: string;
  bg: string;
  border: string;
  headline: (d: MedicationDueDose) => string;
  detail: (d: MedicationDueDose) => string;
}

/**
 * One look per dose state, mirroring Figma medicine/02 (due), 03 (snoozed),
 * 04 (taken) and 05 (skipped) as states of the same card.
 */
function lookFor(d: MedicationDueDose, accent: string): Look {
  const snoozeActive = d.status === "snoozed" && d.snoozedUntil != null && new Date(d.snoozedUntil).getTime() > Date.now();
  switch (d.status) {
    case "taken":
      return {
        flow: "Medicine / Taken",
        icon: "check",
        tint: colors.success,
        bg: colors.successSoft,
        border: colors.success,
        headline: () => "Marked as taken",
        detail: (x) => `Logged ${x.loggedAt ? clock(x.loggedAt) : ""} for the ${clock(x.scheduledFor)} dose.`,
      };
    case "skipped":
      return {
        flow: "Medicine / Skipped",
        icon: "minus",
        tint: colors.textSecondary,
        bg: colors.surface,
        border: colors.border,
        headline: () => "Skipped",
        detail: (x) => `The ${clock(x.scheduledFor)} dose was skipped. Ask your prescriber or pharmacist about missed doses.`,
      };
    case "snoozed":
      return {
        flow: "Medicine / Snoozed",
        icon: "clock",
        tint: colors.warning,
        bg: colors.warningSoft,
        border: colors.warning,
        headline: () => (snoozeActive ? "Snoozed" : "Snooze ended"),
        detail: (x) =>
          snoozeActive && x.snoozedUntil
            ? `Reminding you again at ${clock(x.snoozedUntil)}.`
            : "Log what happened when you're ready.",
      };
    case "missed":
      return {
        flow: "Medicine / Not logged",
        icon: "circle-alert",
        tint: colors.danger,
        bg: colors.dangerSoft,
        border: colors.danger,
        headline: () => "Not logged",
        detail: (x) => `The ${clock(x.scheduledFor)} dose wasn't logged. You can still record it.`,
      };
    default:
      return {
        flow: "Medicine / Due now",
        icon: "bell",
        tint: accent,
        bg: colors.infoSurface,
        border: colors.infoBorder,
        headline: () => "Your reminder is due",
        detail: (x) => `Scheduled for ${clock(x.scheduledFor)}. Not logged yet.`,
      };
  }
}

function DoseCard({
  dose,
  busy,
  onLog,
}: {
  dose: MedicationDueDose;
  busy: boolean;
  onLog: (status: MedicationDoseStatus) => void;
}) {
  const { colors: theme } = useTheme();
  const look = lookFor(dose, theme.accent);
  const settled = dose.status === "taken" || dose.status === "skipped";
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.card,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Icon name={look.icon} size={16} color={look.tint} />
        <Text style={{ color: look.tint, ...typography.label, fontSize: 11, letterSpacing: 0.7 }}>{look.flow.toUpperCase()}</Text>
      </View>
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h2 }}>
        {look.headline(dose)}
      </Text>
      <View style={{ backgroundColor: look.bg, borderColor: look.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm + 4, gap: 4 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>
          {dose.name} · {dose.dosage}
          {dose.form ? ` · ${dose.form}` : ""}
        </Text>
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>{look.detail(dose)}</Text>
      </View>
      {settled ? null : (
        <View style={{ gap: spacing.sm }}>
          <Button label="Mark as taken" loading={busy} onPress={() => onLog("taken")} />
          <Button label={`Snooze for ${SNOOZE_MINUTES} minutes`} variant="secondary" disabled={busy} onPress={() => onLog("snoozed")} />
          <Button label="Skip this reminder" variant="secondary" disabled={busy} onPress={() => onLog("skipped")} />
        </View>
      )}
    </View>
  );
}

/** Medicine 02-05 - today's due doses with Taken / Snooze / Skip and the resulting states. */
export function MedicineDueScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const date = localDateString();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["medications", "due", date],
    queryFn: () => fetchDueMedications(date),
  });

  const log = useMutation({
    mutationFn: async (v: { dose: MedicationDueDose; status: MedicationDoseStatus }) => {
      const snoozedUntil = new Date(Date.now() + SNOOZE_MINUTES * 60_000).toISOString();
      const saved = await logMedicationDose(v.dose.medicationId, {
        scheduledFor: v.dose.scheduledFor,
        status: v.status,
        snoozedUntil: v.status === "snoozed" ? snoozedUntil : undefined,
      });
      if (v.status === "snoozed" && Platform.OS !== "web") {
        // Best-effort local re-reminder; generic lock-screen copy (no name/dose).
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "23PrimeFit",
              body: "You have a scheduled reminder. Open 23PrimeFit to view details.",
              data: { kind: "medication", deepLink: "/medicine/due" },
            },
            trigger: { seconds: SNOOZE_MINUTES * 60 },
          });
        } catch {
          // permission denied or unsupported
        }
      }
      return saved;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["medications"] });
      toast.show(
        v.status === "taken" ? "Logged as taken" : v.status === "skipped" ? "Skipped" : `Snoozed for ${SNOOZE_MINUTES} minutes`,
        "success",
      );
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't log this dose."), "error"),
  });

  const items = [...(data?.items ?? [])].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  return (
    <ScreenContainer
      title="Today's medicine"
      subtitle="Log what happened when you're ready"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.accent} />}
    >
      <BackButton onPress={() => navigation.goBack()} />
      {isLoading ? (
        <SkeletonCard lines={3} />
      ) : isError ? (
        <ErrorState message="Couldn't load today's doses." onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing due today"
          subtitle="Doses scheduled for today will appear here."
          actionLabel="Manage medication"
          onAction={() => navigation.navigate("MedicationList")}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          {items.map((d) => (
            <DoseCard
              key={`${d.medicationId}-${d.scheduledFor}`}
              dose={d}
              busy={log.isPending && log.variables?.dose.medicationId === d.medicationId && log.variables?.dose.scheduledFor === d.scheduledFor}
              onLog={(status) => log.mutate({ dose: d, status })}
            />
          ))}
        </View>
      )}
      <InfoCard
        title="Reminder only"
        body="Not medical advice. Follow your prescription exactly. Ask your prescriber or pharmacist about missed doses; 23PrimeFit does not recommend dose changes."
      />
      <Button label="Manage medication" variant="secondary" onPress={() => navigation.navigate("MedicationList")} />
    </ScreenContainer>
  );
}
