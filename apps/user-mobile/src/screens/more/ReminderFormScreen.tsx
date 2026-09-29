import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Switch, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CreateReminderInput, ReminderCategory } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Stepper } from "../../components/Stepper";
import { Button } from "../../components/Button";
import { createReminder, deleteReminder, updateReminder } from "../../api/reminders";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, spacing } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "ReminderForm">;

const CATEGORIES: Array<{ value: ReminderCategory; label: string }> = [
  { value: "workout", label: "Workout" },
  { value: "meal", label: "Meal" },
  { value: "water", label: "Water" },
  { value: "measurement", label: "Measurement" },
  { value: "general", label: "General" },
];

// Meal-timing presets (docs/mobile/03-screen-inventory.md §K "meal-timing
// presets") — only shown for the meal category, where a default time and
// label genuinely differ; the other categories don't have an equivalent
// well-known default.
const MEAL_PRESETS: Array<{ label: string; hour: number; minute: number }> = [
  { label: "Breakfast", hour: 8, minute: 0 },
  { label: "Lunch", hour: 12, minute: 30 },
  { label: "Dinner", hour: 18, minute: 30 },
];

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

function sameDays(a: number[], b: number[]) {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

/**
 * Add/Edit Reminder (docs/mobile/03-screen-inventory.md §K) — one screen
 * for both: with a `reminder` param it's Edit (prefilled, with Delete), no
 * param it's Add. The category chips, meal-timing presets, a 12-hour time
 * picker with AM/PM toggle, repeat presets, a day-of-week selector, and a
 * sound toggle all match the design doc. Not built: custom alarm sounds
 * (only default-sound on/off — no bundled audio assets) and any
 * server-push path, since these are purely local, on-device notifications
 * (see ../../lib/reminderNotifications.ts).
 */
export function ReminderFormScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const existing = route.params?.reminder;
  const queryClient = useQueryClient();

  const [category, setCategory] = useState<ReminderCategory>(existing?.category ?? "general");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [hour24, setHour24] = useState(existing?.hour ?? 8);
  const [minute, setMinute] = useState(existing?.minute ?? 0);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(existing?.daysOfWeek ?? ALL_DAYS);
  const [playSound, setPlaySound] = useState(existing?.playSound ?? true);
  const [isEnabled, setIsEnabled] = useState(existing?.isEnabled ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  const setHour12 = (next12: number) => {
    const wrapped = ((next12 - 1 + 12) % 12) + 1; // keep in 1..12
    const isPm = period === "PM";
    setHour24((wrapped % 12) + (isPm ? 12 : 0));
  };

  const togglePeriod = (nextPeriod: "AM" | "PM") => {
    if (nextPeriod === period) return;
    setHour24((prev) => (nextPeriod === "PM" ? (prev % 12) + 12 : prev % 12));
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  };

  const canSubmit = label.trim().length > 0 && daysOfWeek.length > 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reminders"] });

  const onSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const input: CreateReminderInput = {
        category,
        label: label.trim(),
        hour: hour24,
        minute,
        daysOfWeek,
        playSound,
        isEnabled,
      };
      if (existing) {
        await updateReminder(existing.id, input);
      } else {
        await createReminder(input);
      }
      await refresh();
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save reminder", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    setIsDeleting(true);
    try {
      await deleteReminder(existing.id);
      await refresh();
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't delete reminder", extractErrorMessage(err, "Check your connection and try again."));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ScreenContainer title={existing ? "Edit Reminder" : "Add Reminder"}>
      <Card>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          {CATEGORIES.map(({ value, label: categoryLabel }) => (
            <Chip
              key={value}
              label={categoryLabel}
              selected={category === value}
              onPress={() => setCategory(value)}
            />
          ))}
        </View>

        {category === "meal" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
            {MEAL_PRESETS.map((preset) => (
              <Chip
                key={preset.label}
                label={preset.label}
                selected={hour24 === preset.hour && minute === preset.minute}
                onPress={() => {
                  setHour24(preset.hour);
                  setMinute(preset.minute);
                  if (!label.trim()) setLabel(preset.label);
                }}
              />
            ))}
          </View>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Label</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Drink water"
          placeholderTextColor={colors.textMuted}
          value={label}
          onChangeText={setLabel}
        />
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Time</Text>
        <Stepper label="Hour" value={hour12} unit="" min={1} max={12} onChange={setHour12} />
        <Stepper label="Minute" value={minute} unit="" min={0} max={59} onChange={setMinute} />
        <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs }}>
          <Chip label="AM" selected={period === "AM"} onPress={() => togglePeriod("AM")} />
          <Chip label="PM" selected={period === "PM"} onPress={() => togglePeriod("PM")} />
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <Text style={{ color: colors.textSecondary, marginBottom: spacing.xs }}>Repeat</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm }}>
          <Chip label="Every day" selected={sameDays(daysOfWeek, ALL_DAYS)} onPress={() => setDaysOfWeek(ALL_DAYS)} />
          <Chip label="Weekdays" selected={sameDays(daysOfWeek, WEEKDAYS)} onPress={() => setDaysOfWeek(WEEKDAYS)} />
          <Chip label="Weekends" selected={sameDays(daysOfWeek, WEEKENDS)} onPress={() => setDaysOfWeek(WEEKENDS)} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {DAY_LABELS.map((dayLabel, day) => (
            <Chip key={day} label={dayLabel} selected={daysOfWeek.includes(day)} onPress={() => toggleDay(day)} />
          ))}
        </View>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textPrimary }}>Play sound</Text>
          <Switch value={playSound} onValueChange={setPlaySound} trackColor={{ true: colors.accent, false: colors.border }} />
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: spacing.sm,
          }}
        >
          <Text style={{ color: colors.textPrimary }}>Enabled</Text>
          <Switch value={isEnabled} onValueChange={setIsEnabled} trackColor={{ true: colors.accent, false: colors.border }} />
        </View>
      </Card>

      <Button
        label={t("common.save")}
        onPress={onSubmit}
        loading={isSubmitting}
        disabled={!canSubmit}
        style={{ marginTop: spacing.lg }}
      />

      {existing ? (
        <Button
          label="Delete Reminder"
          variant="secondary"
          onPress={onDelete}
          loading={isDeleting}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = {
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
  },
} as const;
