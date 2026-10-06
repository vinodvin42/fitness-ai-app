import React, { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Medication, MedicationDoseStatus, MedicationDueDose } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { BrandMark } from "../../components/BrandMark";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { SkeletonCard } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../context/AuthContext";
import { clearMedicationDose, fetchDueMedications, fetchMedications, logMedicationDose } from "../../api/medications";
import { extractErrorMessage } from "../../lib/apiError";
import { BRAND_NAME } from "../../lib/brand";
import { cancelSnoozeNotification, scheduleSnoozeNotification } from "../../lib/medicationNotifications";
import {
  formatClockTz,
  formatLongDate,
  formatScheduledStamp,
  formatStamp,
  localDateOf,
  lockScreenCopy,
} from "../../lib/medicationReminder";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MedicineOccurrence">;

const SNOOZE_MINUTES = 10;

type Phase = "due" | "snoozed" | "taken" | "skipped";

function phaseOf(d: MedicationDueDose): Phase {
  if (d.status === "taken" || d.status === "skipped" || d.status === "snoozed") return d.status;
  return "due";
}

const COPY: Record<Phase, { eyebrow: string; title: string }> = {
  due: { eyebrow: "Medicine / Due now", title: "Your reminder is due" },
  snoozed: { eyebrow: "Medicine / Snoozed", title: "Reminder snoozed" },
  taken: { eyebrow: "Medicine / Taken", title: "Marked as taken" },
  skipped: { eyebrow: "Medicine / Skipped", title: "Marked as skipped" },
};

const BASE_DISCLAIMER = `Reminder only, not medical advice. Follow your prescription exactly. Ask your prescriber or pharmacist about missed doses; ${BRAND_NAME} does not recommend dose changes.`;

function subtitleFor(phase: Phase, firstName: string): string {
  switch (phase) {
    case "due":
      return `${firstName ? `${firstName}, this` : "This"} is your scheduled reminder. Log what happened when you're ready.`;
    case "snoozed":
      return "You paused this alert for 10 minutes. Snoozing changes the reminder time, not your prescription instructions.";
    case "taken":
      return "Your entry has been recorded. This status reflects what you logged; it is not a medical verification.";
    case "skipped":
      return "This occurrence is recorded as skipped. There's no score or penalty; your history simply reflects your entry.";
  }
}

function extraDisclaimer(phase: Phase): string | null {
  switch (phase) {
    case "snoozed":
      return "Another alert depends on device notification settings. The in-app snoozed status remains visible.";
    case "taken":
      return "Marked it by mistake? Correct this entry so your reminder history reflects what happened.";
    case "skipped":
      return `${BRAND_NAME} doesn't suggest a catch-up dose. Contact your prescriber or pharmacist if you're unsure what to do.`;
    default:
      return null;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md }}>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, ...typography.label, flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

/** Medicine 02-05: one reminder occurrence in its Due / Snoozed / Taken / Skipped state. */
export function MedicineOccurrenceScreen({ navigation, route }: Props) {
  const { medicationId, scheduledFor } = route.params;
  const { user } = useAuth();
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [correcting, setCorrecting] = useState(false);
  const date = localDateOf(scheduledFor);

  const dueQuery = useQuery({
    queryKey: ["medications", "due", date],
    queryFn: () => fetchDueMedications(date),
  });
  const medsQuery = useQuery({ queryKey: ["medications"], queryFn: fetchMedications });

  const dose = dueQuery.data?.items.find(
    (d) => d.medicationId === medicationId && new Date(d.scheduledFor).getTime() === new Date(scheduledFor).getTime(),
  );
  const med: Medication | undefined = medsQuery.data?.find((m) => m.id === medicationId);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["medications"] });

  const log = useMutation({
    mutationFn: async (status: MedicationDoseStatus) => {
      const remindAt = new Date(Date.now() + SNOOZE_MINUTES * 60_000);
      const saved = await logMedicationDose(medicationId, {
        scheduledFor: dose!.scheduledFor,
        status,
        snoozedUntil: status === "snoozed" ? remindAt.toISOString() : undefined,
      });
      if (status === "snoozed" && med) await scheduleSnoozeNotification(med, dose!.scheduledFor, remindAt);
      else await cancelSnoozeNotification(medicationId, dose!.scheduledFor);
      return saved;
    },
    onSuccess: (_d, status) => {
      setCorrecting(false);
      invalidate();
      toast.show(
        status === "taken" ? "Marked as taken" : status === "skipped" ? "Marked as skipped" : `Snoozed for ${SNOOZE_MINUTES} minutes`,
        "success",
      );
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't save this entry."), "error"),
  });

  const clear = useMutation({
    mutationFn: async () => {
      await clearMedicationDose(medicationId, dose!.scheduledFor);
      await cancelSnoozeNotification(medicationId, dose!.scheduledFor);
    },
    onSuccess: () => {
      setCorrecting(false);
      invalidate();
      toast.show("Entry cleared", "success");
    },
    onError: (err) => toast.show(extractErrorMessage(err, "Couldn't clear this entry."), "error"),
  });

  const busy = log.isPending || clear.isPending;

  if (dueQuery.isLoading || medsQuery.isLoading) {
    return (
      <ScreenContainer title="Medicine" right={<BrandMark size={44} withName />}>
        <BackButton onPress={() => navigation.goBack()} />
        <SkeletonCard lines={4} />
      </ScreenContainer>
    );
  }
  if (dueQuery.isError || medsQuery.isError || !dose || !med) {
    return (
      <ScreenContainer title="Medicine" right={<BrandMark size={44} withName />}>
        <BackButton onPress={() => navigation.goBack()} />
        <ErrorState
          message={dueQuery.isError || medsQuery.isError ? "Couldn't load this reminder." : "This reminder occurrence is no longer scheduled."}
          onRetry={() => {
            dueQuery.refetch();
            medsQuery.refetch();
          }}
        />
      </ScreenContainer>
    );
  }

  const phase = phaseOf(dose);
  const copy = COPY[phase];
  const lock = lockScreenCopy(med.detailedPreview, med.name);
  const firstName = (user?.fullName ?? "").trim().split(/\s+/)[0] ?? "";
  const extra = extraDisclaimer(phase);
  const settled = phase === "taken" || phase === "skipped";

  const statusCard = (() => {
    switch (phase) {
      case "due":
        return (
          <>
            <Text style={{ color: theme.accent, ...typography.h3 }}>Due · {formatClockTz(dose.scheduledFor)}</Text>
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>{formatLongDate(dose.scheduledFor)} · Not logged yet</Text>
          </>
        );
      case "snoozed":
        return (
          <>
            <Text style={{ color: theme.accent, ...typography.h3 }}>Snoozed · Not marked as taken</Text>
            {dose.loggedAt ? <Row label="Snoozed at" value={formatStamp(dose.loggedAt)} /> : null}
            {dose.snoozedUntil ? <Row label="Remind again" value={formatStamp(dose.snoozedUntil)} /> : null}
          </>
        );
      case "taken":
        return (
          <>
            <Text style={{ color: theme.accent, ...typography.h3 }}>Taken · Logged by you</Text>
            {dose.loggedAt ? <Row label="Recorded at" value={formatStamp(dose.loggedAt)} /> : null}
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>
              This occurrence is complete. No further alert is planned for this reminder today.
            </Text>
          </>
        );
      case "skipped":
        return (
          <>
            <Text style={{ color: theme.accent, ...typography.h3 }}>Skipped · Logged by you</Text>
            {dose.loggedAt ? <Row label="Recorded at" value={formatStamp(dose.loggedAt)} /> : null}
            <Text style={{ color: colors.textSecondary, ...typography.meta }}>
              Only this reminder occurrence is closed. Your saved schedule and prescription instructions haven't changed.
            </Text>
          </>
        );
    }
  })();

  return (
    <ScreenContainer eyebrow={copy.eyebrow} title={copy.title} subtitle={subtitleFor(phase, firstName)} right={<BrandMark size={44} withName />}>
      <BackButton onPress={() => navigation.goBack()} />

      <View
        accessibilityLiveRegion="polite"
        style={{ backgroundColor: colors.infoSurface, borderColor: colors.infoBorder, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 6 }}
      >
        {statusCard}
      </View>

      <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 6 }}>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.8 }}>USER-ENTERED REMINDER</Text>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{med.name}</Text>
        {med.dosage ? <Text style={{ color: colors.textPrimary, ...typography.body, fontSize: 13 }}>{med.dosage}</Text> : null}
        <Text style={{ color: colors.textSecondary, ...typography.meta }}>
          {med.dosage ? "Dose as entered from your prescription" : "No dose entered"}
        </Text>
        <View style={{ marginTop: 4 }}>
          <Row label="Scheduled" value={formatScheduledStamp(dose.scheduledFor)} />
        </View>
      </View>

      <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.8 }}>LOCK-SCREEN PREVIEW</Text>
          <Icon name="lock" size={14} color={colors.textMuted} />
        </View>
        <Text accessibilityLabel={`Lock-screen preview title: ${lock.title}`} style={{ color: colors.textPrimary, ...typography.h3 }}>{lock.title}</Text>
        {lock.lines.map((line, i) => (
          <Text key={i} style={{ color: i === 0 ? colors.textPrimary : colors.textMuted, ...typography.meta, fontSize: i === 0 ? 13 : 12 }}>
            {line}
          </Text>
        ))}
      </View>

      <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>{BASE_DISCLAIMER}</Text>
      {extra ? <Text style={{ color: colors.textSecondary, ...typography.meta, lineHeight: 17 }}>{extra}</Text> : null}

      {phase === "due" ? (
        <View style={{ gap: spacing.sm }}>
          <Button label="Skip this reminder" variant="secondary" disabled={busy} onPress={() => log.mutate("skipped")} />
          <Button label="Mark as taken" loading={log.isPending && log.variables === "taken"} disabled={busy} onPress={() => log.mutate("taken")} />
          <Button label={`Snooze for ${SNOOZE_MINUTES} minutes`} variant="secondary" disabled={busy} onPress={() => log.mutate("snoozed")} />
        </View>
      ) : null}

      {phase === "snoozed" ? (
        <View style={{ gap: spacing.sm }}>
          <Button label="Mark as taken" loading={log.isPending} disabled={busy} onPress={() => log.mutate("taken")} />
          <Button label="Undo snooze" variant="secondary" loading={clear.isPending} disabled={busy} onPress={() => clear.mutate()} />
        </View>
      ) : null}

      {settled ? (
        <View style={{ gap: spacing.sm }}>
          <Button label="Done" disabled={busy} onPress={() => navigation.goBack()} />
          <Button
            label="Correct this entry"
            variant="secondary"
            disabled={busy}
            onPress={() => setCorrecting((v) => !v)}
          />
          {correcting ? (
            <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
              <Text style={{ color: colors.textSecondary, ...typography.meta }}>
                What actually happened? Your history will show the corrected entry.
              </Text>
              <Button
                label={phase === "taken" ? "Change to skipped" : "Change to taken"}
                variant="secondary"
                disabled={busy}
                loading={log.isPending}
                onPress={() => log.mutate(phase === "taken" ? "skipped" : "taken")}
              />
              <Button label="Clear entry (back to due)" variant="secondary" disabled={busy} loading={clear.isPending} onPress={() => clear.mutate()} />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ height: spacing.lg }} />
    </ScreenContainer>
  );
}
