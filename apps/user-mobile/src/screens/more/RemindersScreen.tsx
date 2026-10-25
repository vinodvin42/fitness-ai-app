import React, { useEffect } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Medication, Reminder } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Icon, IconName } from "../../components/Icon";
import { ErrorState } from "../../components/ErrorState";
import { Pill } from "../../components/Pill";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { fetchReminders, updateReminder } from "../../api/reminders";
import { fetchDueMedications, fetchMedications, localDateString } from "../../api/medications";
import { dueStatusLabel, dueStatusTone } from "./MedicineDueScreen";
import { formatClockTz, splitMedicationNotes, MEAL_LABEL } from "../../lib/medicationReminder";
import { syncMedicationNotifications } from "../../lib/medicationNotifications";
import { useReminderSync } from "../../lib/useReminderSync";
import { dateRangeLabel, localYmd, shortDate } from "../../lib/reminderSchedule";
import { extractErrorMessage } from "../../lib/apiError";
import { formatClock } from "../../lib/format";
import { colors, fonts, radius, spacing, themed } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "Reminders">;

const CATEGORY_LABEL: Record<Reminder["category"], string> = {
  workout: "Workout",
  meal: "Meal",
  water: "Water",
  measurement: "Measurement",
  general: "General",
};

const CATEGORY_META: Record<Reminder["category"], { icon: IconName; tint: string; tintSoft: string }> = themed(() => ({
  workout: { icon: "dumbbell", tint: colors.accent, tintSoft: colors.accentSoft },
  meal: { icon: "utensils", tint: colors.success, tintSoft: colors.successSoft },
  water: { icon: "droplet", tint: colors.cyan, tintSoft: "rgba(34,211,238,0.16)" },
  measurement: { icon: "trending-up", tint: colors.warning, tintSoft: colors.warningSoft },
  general: { icon: "bell", tint: colors.aiAccent, tintSoft: colors.aiAccentSoft },
}));

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(hour: number, minute: number) {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

function formatDays(daysOfWeek: number[]) {
  if (daysOfWeek.length === 7) return "Every day";
  const sorted = [...daysOfWeek].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted.join(",") === "1,2,3,4,5") return "Weekdays";
  if (sorted.length === 2 && sorted.join(",") === "0,6") return "Weekends";
  return sorted.map((d) => DAY_ABBR[d]).join(", ");
}

function IconTile({ icon, tint, tintSoft }: { icon: IconName; tint: string; tintSoft: string }) {
  return (
    <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: tintSoft, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={20} color={tint} />
    </View>
  );
}

/** One row inside a grouped card, with a hairline above every row but the first. */
const rowStyle = (first: boolean) =>
  ({
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderTopWidth: first ? 0 : 1,
    borderTopColor: colors.border,
  }) as const;

function AddRow({ label, onPress, first }: { label: string; onPress: () => void; first?: boolean }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [rowStyle(!!first), { opacity: pressed ? 0.8 : 1 }]}>
      <View style={{ width: 40, height: 40, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }}>
        <Icon name="plus" size={18} color={theme.accentText} />
      </View>
      <Text style={{ flex: 1, color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

/** "Until 30 Oct", "From 1 Nov", "Ended" under a row (25 Oct 2026); "Ended" stands out. */
function DateLine({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <Text style={{ color: label === "Ended" ? colors.warningText : colors.textMuted, fontSize: 12 }} numberOfLines={1}>
      {label}
    </Text>
  );
}

function MedicineRow({ med, first, onPress }: { med: Medication; first: boolean; onPress: () => void }) {
  const notes = splitMedicationNotes(med);
  const once = med.repeatMode === "once";
  const range = once ? (med.startDate.slice(0, 10) < localYmd() ? "Ended" : null) : dateRangeLabel(med.startDate, med.endDate);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${[med.name, med.dosage].filter(Boolean).join(", ")}. Edit`}
      style={({ pressed }) => [rowStyle(first), { backgroundColor: pressed ? colors.surfaceRaised : "transparent" }]}
    >
      <IconTile icon="pill" tint={colors.pink} tintSoft="rgba(236,72,153,0.16)" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{med.name}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
          {[med.dosage, notes.mealTiming ? MEAL_LABEL[notes.mealTiming] : ""].filter(Boolean).join(" · ") || "No dose entered"}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
          {med.scheduleTimes.map(formatClock).join(", ")} · {once ? `Once, ${shortDate(med.startDate.slice(0, 10))}` : formatDays(med.daysOfWeek)}
        </Text>
        <DateLine label={range} />
      </View>
      {!med.isActive ? <Pill label="Paused" /> : null}
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * Reminders (docs/mobile/03-screen-inventory.md §K, Phase 4): every
 * reminder is a real on-device local notification (expo-notifications,
 * src/lib/reminderNotifications.ts and medicationNotifications.ts); there's
 * no server push.
 *
 * 25 Oct 2026 (owner: "merge medicine in reminders"): Medicine lives here
 * too, first, with today's doses that still need an answer; the More menu
 * has one Reminders entry. The medicine screens (form, today's doses, a
 * dose) are unchanged and open from here. This screen now also keeps the
 * on-device medicine schedule in step with the server, as the medicine list
 * did.
 */
export function RemindersScreen({ navigation }: Props) {
  const { colors: theme } = useTheme();
  const queryClient = useQueryClient();
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: fetchReminders });
  const meds = useQuery({ queryKey: ["medications"], queryFn: fetchMedications });
  const date = localDateString();
  const due = useQuery({ queryKey: ["medications", "due", date], queryFn: () => fetchDueMedications(date) });
  // Doses still needing a decision today; tapping one opens it.
  const open = (due.data?.items ?? []).filter((d) => d.status === "pending" || d.status === "missed" || d.status === "snoozed");

  // Master/category preferences gate scheduling; the OS prompt is preceded by the pre-prompt screen.
  useReminderSync(reminders.data, () => navigation.navigate("NotificationPermission"));
  // Keep the on-device medicine schedule in step with the server list (best-effort).
  useEffect(() => {
    if (meds.data) syncMedicationNotifications(meds.data).catch(() => undefined);
  }, [meds.data]);

  const onToggle = async (reminder: Reminder, isEnabled: boolean) => {
    try {
      await updateReminder(reminder.id, { isEnabled });
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });
    } catch (err) {
      Alert.alert("Couldn't update reminder", extractErrorMessage(err, "Check your connection and try again."));
    }
  };

  const medList = meds.data ?? [];
  const reminderList = reminders.data ?? [];

  return (
    <ScreenContainer title="Reminders" subtitle="Medicine, workouts, meals, water and more" onBack={() => navigation.goBack()}>
      {/* Medicine */}
      <SectionHeader title="Medicine" action={medList.length > 0 ? { label: "Today's doses", onPress: () => navigation.navigate("MedicineDue") } : undefined} />
      {meds.isLoading ? (
        <SkeletonCard lines={2} />
      ) : meds.isError ? (
        <ErrorState message="Couldn't load your medicine." onRetry={() => meds.refetch()} />
      ) : (
        <>
          {open.length > 0 ? (
            <Card style={{ padding: 0, overflow: "hidden", borderColor: theme.accent }}>
              <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15, paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 4 }}>
                Due today
              </Text>
              {open.map((d, i) => (
                <Pressable
                  key={`${d.medicationId}-${d.scheduledFor}`}
                  onPress={() => navigation.navigate("MedicineOccurrence", { medicationId: d.medicationId, scheduledFor: d.scheduledFor })}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.name}, ${formatClockTz(d.scheduledFor)}, ${dueStatusLabel(d)}. Open`}
                  style={({ pressed }) => [rowStyle(i === 0), { paddingVertical: 10, backgroundColor: pressed ? colors.surfaceRaised : "transparent" }]}
                >
                  <Icon name="bell" size={16} color={theme.accentText} />
                  <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 14 }}>
                    {d.name} · {formatClockTz(d.scheduledFor)}
                  </Text>
                  <Pill label={dueStatusLabel(d)} tone={dueStatusTone(d)} />
                  <Icon name="chevron-right" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </Card>
          ) : null}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {medList.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingHorizontal: spacing.md, paddingTop: 14 }}>
                Add what you take and when, and we'll remind you. Follow your prescription exactly.
              </Text>
            ) : null}
            {medList.map((m, i) => (
              <MedicineRow key={m.id} med={m} first={i === 0} onPress={() => navigation.navigate("MedicationForm", { medication: m })} />
            ))}
            <AddRow label="Add medicine" first={medList.length === 0} onPress={() => navigation.navigate("MedicationForm")} />
          </Card>
        </>
      )}

      {/* Everything else */}
      <SectionHeader title="Other reminders" />
      {reminders.isLoading ? (
        <SkeletonCard lines={2} />
      ) : reminders.isError ? (
        <ErrorState onRetry={() => reminders.refetch()} />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {reminderList.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, paddingHorizontal: spacing.md, paddingTop: 14 }}>
              Add one for workouts, meals, water or measurements.
            </Text>
          ) : null}
          {reminderList.map((reminder, i) => {
            const meta = CATEGORY_META[reminder.category];
            return (
              <View key={reminder.id} style={rowStyle(i === 0)}>
                <IconTile icon={meta.icon} tint={meta.tint} tintSoft={meta.tintSoft} />
                <Pressable
                  style={{ flex: 1, gap: 2 }}
                  onPress={() => navigation.navigate("ReminderForm", { reminder })}
                  accessibilityRole="button"
                  accessibilityLabel={`${reminder.label}, ${formatTime(reminder.hour, reminder.minute)}. Edit`}
                >
                  <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{reminder.label}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {CATEGORY_LABEL[reminder.category]} · {formatTime(reminder.hour, reminder.minute)} · {formatDays(reminder.daysOfWeek)}
                  </Text>
                  <DateLine label={dateRangeLabel(reminder.startDate, reminder.endDate)} />
                </Pressable>
                <Switch
                  value={reminder.isEnabled}
                  onValueChange={(value) => onToggle(reminder, value)}
                  trackColor={{ true: theme.accent, false: colors.border }}
                  accessibilityLabel={`${reminder.label} on`}
                />
              </View>
            );
          })}
          <AddRow label="Add reminder" first={reminderList.length === 0} onPress={() => navigation.navigate("ReminderForm", {})} />
        </Card>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
        Medicine reminders are reminders only, not medical advice. Lock-screen alerts are generic unless you turn on Detailed Preview for a
        reminder. Ask your prescriber or pharmacist about missed doses; Fynrox doesn't recommend dose changes.
      </Text>
    </ScreenContainer>
  );
}
