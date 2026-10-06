import React, { useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CreateMedicationInput, MedicationMealTiming, MedicationRepeatMode } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { DateWheel, TimeWheel } from "../../components/WheelPicker";
import { useToast } from "../../components/Toast";
import { useTheme } from "../../theme/ThemeProvider";
import { createMedication, deleteMedication, localDateString, updateMedication } from "../../api/medications";
import { requestNotificationPermissions } from "../../lib/reminderNotifications";
import { extractErrorMessage } from "../../lib/apiError";
import { formatDayMonthYear, splitMedicationNotes } from "../../lib/medicationReminder";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MedicationForm">;

// Figma shows the week Monday-first (M T W T F S S); values are JS getDay() (0 = Sunday).
const WEEK: Array<{ label: string; day: number }> = [
  { label: "M", day: 1 },
  { label: "T", day: 2 },
  { label: "W", day: 3 },
  { label: "T", day: 4 },
  { label: "F", day: 5 },
  { label: "S", day: 6 },
  { label: "S", day: 0 },
];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const REPEAT_OPTIONS: Array<{ value: MedicationRepeatMode; label: string }> = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "selected", label: "Selected days" },
];

function SectionLabel({ children }: { children: string }) {
  return <Text style={{ color: colors.textSecondary, ...typography.label, marginBottom: spacing.xs }}>{children}</Text>;
}

function Pill({ label, selected, onPress, flex = true }: { label: string; selected: boolean; onPress: () => void; flex?: boolean }) {
  const { colors: theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        flex: flex ? 1 : undefined,
        height: 40,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? theme.accent : colors.surface,
        borderWidth: 1,
        borderColor: selected ? theme.accent : colors.border,
      }}
    >
      <Text style={{ color: selected ? theme.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  last,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  const { colors: theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.sm + 2,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }}>{title}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={title}
        trackColor={{ true: theme.accent, false: colors.surfaceHigh }}
        thumbColor="#fff"
      />
    </View>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{title}</Text>
        <Text style={{ color: colors.textMuted, ...typography.meta }}>Optional</Text>
      </View>
      {children}
    </View>
  );
}

/** Medicine 01 - Add / Edit Reminder. With a `medication` param it edits. */
export function MedicationFormScreen({ navigation, route }: Props) {
  const existing = route.params?.medication;
  const queryClient = useQueryClient();
  const toast = useToast();
  const legacy = existing ? splitMedicationNotes(existing) : { mealTiming: null, note: "" };

  const [name, setName] = useState(existing?.name ?? "");
  const [dosage, setDosage] = useState(existing?.dosage ?? "");
  const [times, setTimes] = useState<string[]>(existing?.scheduleTimes?.length ? existing.scheduleTimes : ["08:00"]);
  const [timeIdx, setTimeIdx] = useState(0);
  const [repeat, setRepeat] = useState<MedicationRepeatMode>(
    existing ? (existing.repeatMode === "daily" && existing.daysOfWeek.length < 7 ? "selected" : existing.repeatMode ?? "daily") : "daily",
  );
  const [days, setDays] = useState<number[]>(existing?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [meal, setMeal] = useState<MedicationMealTiming | null>(legacy.mealTiming);
  const [note, setNote] = useState(legacy.note);
  const [startDate, setStartDate] = useState(existing?.startDate?.slice(0, 10) ?? "");
  const [showDate, setShowDate] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(existing?.pushEnabled ?? true);
  const [soundEnabled, setSoundEnabled] = useState(existing?.soundEnabled ?? true);
  const [vibrationEnabled, setVibrationEnabled] = useState(existing?.vibrationEnabled ?? false);
  const [detailedPreview, setDetailedPreview] = useState(existing?.detailedPreview ?? false);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);

  const safeIdx = Math.min(timeIdx, times.length - 1);
  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  const canSave = name.trim().length > 0 && times.length > 0 && (repeat !== "selected" || days.length > 0);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["medications"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const input: CreateMedicationInput = {
        name: name.trim(),
        dosage: dosage.trim(),
        form: existing?.form ?? null,
        scheduleTimes: [...new Set(times)].sort(),
        daysOfWeek: repeat === "selected" ? days : ALL_DAYS,
        startDate: startDate || localDateString(),
        endDate: repeat === "once" ? startDate || localDateString() : repeat === "selected" || repeat === "daily" ? existing?.endDate?.slice(0, 10) ?? null : null,
        notes: note.trim() || null,
        isActive,
        repeatMode: repeat,
        mealTiming: meal,
        pushEnabled,
        soundEnabled,
        vibrationEnabled,
        detailedPreview,
      };
      // A reminder switched away from "once" must not keep the single-day endDate.
      if (existing && existing.repeatMode === "once" && repeat !== "once") input.endDate = null;
      if (existing) return updateMedication(existing.id, input);
      return createMedication(input);
    },
    onSuccess: async () => {
      refresh();
      // Best-effort local-notification permission; the list screen reschedules.
      await requestNotificationPermissions().catch(() => false);
      toast.show(existing ? "Reminder updated" : "Reminder saved", "success");
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't save", extractErrorMessage(err, "Check your connection and try again.")),
  });

  const remove = useMutation({
    mutationFn: () => deleteMedication(existing!.id),
    onSuccess: () => {
      refresh();
      toast.show("Reminder deleted", "success");
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't delete", extractErrorMessage(err, "Try again.")),
  });

  return (
    <ScreenContainer title={existing ? "Edit Reminder" : "Add Reminder"}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={{ color: colors.textSecondary, ...typography.meta }}>
        Reminder only. Follow your prescription exactly. Lock-screen alerts stay private.
      </Text>

      <View>
        <SectionLabel>Reminder Type</SectionLabel>
        <View
          accessibilityLabel="Reminder type: Medicine"
          style={{ minHeight: 48, justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md }}
        >
          <Text style={{ color: colors.textPrimary, ...typography.body }}>Medicine</Text>
        </View>
      </View>

      <TextField label="Reminder Title" value={name} onChangeText={setName} placeholder="e.g., Morning BP Medicine" maxLength={120} />

      <View>
        <SectionLabel>Time</SectionLabel>
        <TimeWheel
          value={times[safeIdx]}
          onChange={(next) => setTimes((prev) => prev.map((x, i) => (i === safeIdx ? next : x)))}
        />
        {times.length > 1 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm }}>
            {times.map((t, i) => (
              <Pressable
                key={`${t}-${i}`}
                onPress={() => setTimeIdx(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: i === safeIdx }}
                accessibilityLabel={`Edit time ${t}`}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: i === safeIdx ? colors.accent : colors.border,
                  backgroundColor: i === safeIdx ? colors.accentSoft : colors.surface,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 12 }}>{t}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                setTimes((prev) => prev.filter((_, i) => i !== safeIdx));
                setTimeIdx(0);
              }}
              accessibilityRole="button"
              accessibilityLabel="Remove selected time"
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: colors.danger, ...typography.meta }}>Remove</Text>
            </Pressable>
          </View>
        ) : null}
        {times.length < 12 ? (
          <Pressable
            onPress={() => {
              setTimes((prev) => [...prev, "20:00"]);
              setTimeIdx(times.length);
            }}
            accessibilityRole="button"
            style={{ alignSelf: "flex-start", marginTop: spacing.sm }}
          >
            <Text style={{ color: colors.accent, ...typography.label }}>+ Add another time</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionLabel>Repeat</SectionLabel>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {REPEAT_OPTIONS.map((o) => (
            <Pill key={o.value} label={o.label} selected={repeat === o.value} onPress={() => setRepeat(o.value)} />
          ))}
        </View>
        {repeat === "selected" ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {WEEK.map((w, i) => {
              const on = days.includes(w.day);
              return (
                <Pressable
                  key={i}
                  onPress={() => toggleDay(w.day)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={WEEKDAY_NAMES[w.day]}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: on ? colors.accent : colors.surface,
                    borderWidth: 1,
                    borderColor: on ? colors.accent : colors.border,
                  }}
                >
                  <Text style={{ color: on ? colors.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{w.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {repeat === "selected" && days.length === 0 ? (
          <Text style={{ color: colors.danger, ...typography.meta }}>Pick at least one day.</Text>
        ) : null}
      </View>

      <Panel title="Medicine details">
        <TextField
          label="Dose / Instructions"
          value={dosage}
          onChangeText={setDosage}
          placeholder="Enter dose / instructions from prescription"
          maxLength={80}
          helper="Optional. Enter exactly as shown on your prescription label."
        />
        <View>
          <SectionLabel>Meal Timing</SectionLabel>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pill label="Before Food" selected={meal === "before_food"} onPress={() => setMeal(meal === "before_food" ? null : "before_food")} />
            <Pill label="After Food" selected={meal === "after_food"} onPress={() => setMeal(meal === "after_food" ? null : "after_food")} />
          </View>
        </View>
      </Panel>

      <TextField label="Note" value={note} onChangeText={setNote} placeholder="Add a note (optional)" maxLength={400} />

      <Panel title="Advanced">
        <View>
          <SectionLabel>Start Date</SectionLabel>
          <Pressable
            onPress={() => {
              if (!startDate) setStartDate(localDateString());
              setShowDate((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel="Start date"
            style={{ minHeight: 48, justifyContent: "center", backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md }}
          >
            <Text style={{ color: startDate ? colors.textPrimary : colors.textMuted, ...typography.body }}>
              {startDate ? formatDayMonthYear(new Date(`${startDate}T12:00:00`)) : "Select start date"}
            </Text>
          </Pressable>
          {showDate && startDate ? (
            <View style={{ marginTop: spacing.sm }}>
              <DateWheel value={startDate} onChange={setStartDate} />
            </View>
          ) : null}
        </View>
        <View>
          <ToggleRow title="Push Notification" subtitle="Alert screens on arrival time" value={pushEnabled} onValueChange={setPushEnabled} />
          <ToggleRow title="Sound Alert" subtitle="Default digital notification bell" value={soundEnabled} onValueChange={setSoundEnabled} />
          <ToggleRow title="Vibration" subtitle="Haptic vibration pulse" value={vibrationEnabled} onValueChange={setVibrationEnabled} />
          <ToggleRow
            title="Detailed Preview"
            subtitle="Show full reminder preview"
            value={detailedPreview}
            onValueChange={setDetailedPreview}
            last={!existing}
          />
          {existing ? (
            <ToggleRow title="Reminders on" subtitle="Turn off to pause this reminder" value={isActive} onValueChange={setIsActive} last />
          ) : null}
        </View>
      </Panel>

      <Button label="Save Reminder" loading={save.isPending} disabled={!canSave} onPress={() => save.mutate()} />
      {existing ? (
        <Button
          label="Delete reminder"
          variant="secondary"
          loading={remove.isPending}
          onPress={() =>
            Alert.alert("Delete reminder?", "Its schedule and dose history will be removed.", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
            ])
          }
        />
      ) : null}
      <View style={{ height: spacing.lg }} />
    </ScreenContainer>
  );
}
