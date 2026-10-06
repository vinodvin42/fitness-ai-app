import React, { useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CreateMedicationInput } from "@fitness-ai-app/types";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BackButton } from "../../components/BackButton";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { TextField } from "../../components/TextField";
import { useToast } from "../../components/Toast";
import { createMedication, deleteMedication, localDateString, updateMedication } from "../../api/medications";
import { requestNotificationPermissions } from "../../lib/reminderNotifications";
import { extractErrorMessage } from "../../lib/apiError";
import { colors, fonts, radius, spacing, typography } from "../../theme/tokens";
import type { MoreStackParamList } from "../../navigation/MoreStack";

type Props = NativeStackScreenProps<MoreStackParamList, "MedicationForm">;

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const FORMS = ["Tablet", "Capsule", "Liquid", "Injection", "Other"];
type MealTiming = "none" | "Before food" | "After food";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sameDays(a: number[], b: number[]) {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Meal timing has no field of its own on Medication, so it travels as a leading token in `notes`. */
function splitNotes(notes: string | null | undefined): { timing: MealTiming; note: string } {
  const n = notes ?? "";
  for (const t of ["Before food", "After food"] as const) {
    if (n === t) return { timing: t, note: "" };
    if (n.startsWith(`${t} · `)) return { timing: t, note: n.slice(t.length + 3) };
  }
  return { timing: "none", note: n };
}

function TimeEditor({
  value,
  onChange,
  onRemove,
}: {
  value: string;
  onChange: (next: string) => void;
  onRemove?: () => void;
}) {
  const [h24, m] = value.split(":").map((v) => Number(v));
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const set = (nextH24: number, nextM: number) => onChange(`${pad((nextH24 + 24) % 24)}:${pad((nextM + 60) % 60)}`);
  const setH12 = (delta: number) => {
    const next12 = ((h12 - 1 + delta + 12) % 12) + 1;
    set((next12 % 12) + (period === "PM" ? 12 : 0), m);
  };
  const stepBtn = {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
      <Pressable onPress={() => setH12(-1)} accessibilityRole="button" accessibilityLabel="Earlier hour" style={stepBtn}>
        <Icon name="minus" size={16} color={colors.textPrimary} />
      </Pressable>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 20, minWidth: 28, textAlign: "center" }}>{pad(h12)}</Text>
      <Pressable onPress={() => setH12(1)} accessibilityRole="button" accessibilityLabel="Later hour" style={stepBtn}>
        <Icon name="plus" size={16} color={colors.textPrimary} />
      </Pressable>
      <Text style={{ color: colors.textSecondary, fontSize: 20 }}>:</Text>
      <Pressable onPress={() => set(h24, m - 5)} accessibilityRole="button" accessibilityLabel="Earlier minute" style={stepBtn}>
        <Icon name="minus" size={16} color={colors.textPrimary} />
      </Pressable>
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 20, minWidth: 28, textAlign: "center" }}>{pad(m)}</Text>
      <Pressable onPress={() => set(h24, m + 5)} accessibilityRole="button" accessibilityLabel="Later minute" style={stepBtn}>
        <Icon name="plus" size={16} color={colors.textPrimary} />
      </Pressable>
      <View style={{ flexDirection: "row", gap: 4, marginLeft: spacing.xs }}>
        <Chip label="AM" selected={period === "AM"} onPress={() => set(period === "PM" ? h24 - 12 : h24, m)} />
        <Chip label="PM" selected={period === "PM"} onPress={() => set(period === "AM" ? h24 + 12 : h24, m)} />
      </View>
      {onRemove ? (
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove this time" hitSlop={8}>
          <Icon name="x" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Medicine 01 - Add / Edit Medication (reminder setup). With a `medication` param it edits. */
export function MedicationFormScreen({ navigation, route }: Props) {
  const existing = route.params?.medication;
  const queryClient = useQueryClient();
  const toast = useToast();
  const initialNotes = splitNotes(existing?.notes);

  const [name, setName] = useState(existing?.name ?? "");
  const [dosage, setDosage] = useState(existing?.dosage ?? "");
  const [form, setForm] = useState<string | null>(existing?.form ?? null);
  const [times, setTimes] = useState<string[]>(existing?.scheduleTimes?.length ? existing.scheduleTimes : ["08:00"]);
  const [days, setDays] = useState<number[]>(existing?.daysOfWeek ?? ALL_DAYS);
  const [meal, setMeal] = useState<MealTiming>(initialNotes.timing);
  const [note, setNote] = useState(initialNotes.note);
  const [startDate, setStartDate] = useState(existing?.startDate?.slice(0, 10) ?? localDateString());
  const [endDate, setEndDate] = useState(existing?.endDate?.slice(0, 10) ?? "");
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const dateError =
    (startDate && !DATE_RE.test(startDate)) || (endDate && !DATE_RE.test(endDate))
      ? "Dates must be YYYY-MM-DD."
      : endDate && endDate < startDate
        ? "End date can't be before the start date."
        : null;
  const canSave = name.trim().length > 0 && dosage.trim().length > 0 && times.length > 0 && days.length > 0 && !dateError;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["medications"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const notes = [meal === "none" ? "" : meal, note.trim()].filter(Boolean).join(" · ");
      const input: CreateMedicationInput = {
        name: name.trim(),
        dosage: dosage.trim(),
        form: form,
        scheduleTimes: [...new Set(times)].sort(),
        daysOfWeek: days,
        startDate: startDate || localDateString(),
        endDate: endDate || null,
        notes: notes || null,
        isActive,
      };
      if (existing) return updateMedication(existing.id, input);
      return createMedication(input);
    },
    onSuccess: async () => {
      refresh();
      // Best-effort local-notification permission; the list screen reschedules.
      await requestNotificationPermissions().catch(() => false);
      toast.show(existing ? "Medication updated" : "Medication added", "success");
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't save", extractErrorMessage(err, "Check your connection and try again.")),
  });

  const remove = useMutation({
    mutationFn: () => deleteMedication(existing!.id),
    onSuccess: () => {
      refresh();
      toast.show("Medication deleted", "success");
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't delete", extractErrorMessage(err, "Try again.")),
  });

  return (
    <ScreenContainer title={existing ? "Edit medication" : "Add medication"}>
      <BackButton onPress={() => navigation.goBack()} />
      <Text style={{ color: colors.textSecondary, ...typography.meta }}>
        Reminder only. Follow your prescription exactly. Lock-screen alerts stay private.
      </Text>

      <Card style={{ gap: spacing.md }}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Morning BP medicine" maxLength={120} />
        <TextField
          label="Dose / instructions"
          value={dosage}
          onChangeText={setDosage}
          placeholder="Enter dose exactly as on your prescription"
          maxLength={80}
          helper="Enter exactly as shown on your prescription label."
        />
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textSecondary, ...typography.label }}>Form (optional)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
            {FORMS.map((f) => (
              <Chip key={f} label={f} selected={form === f} onPress={() => setForm(form === f ? null : f)} />
            ))}
          </View>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text style={{ color: colors.textSecondary, ...typography.label }}>Times</Text>
        {times.map((t, i) => (
          <TimeEditor
            key={i}
            value={t}
            onChange={(next) => setTimes((prev) => prev.map((x, idx) => (idx === i ? next : x)))}
            onRemove={times.length > 1 ? () => setTimes((prev) => prev.filter((_, idx) => idx !== i)) : undefined}
          />
        ))}
        {times.length < 12 ? (
          <Button label="Add another time" variant="secondary" onPress={() => setTimes((prev) => [...prev, "20:00"])} style={{ height: 44 }} />
        ) : null}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.textSecondary, ...typography.label }}>Repeat</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
          <Chip label="Daily" selected={sameDays(days, ALL_DAYS)} onPress={() => setDays(ALL_DAYS)} />
          <Chip label="Weekdays" selected={sameDays(days, WEEKDAYS)} onPress={() => setDays(WEEKDAYS)} />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {DAY_LABELS.map((d, i) => (
            <Chip key={i} label={d} selected={days.includes(i)} onPress={() => toggleDay(i)} />
          ))}
        </View>
        <Text style={{ color: colors.textSecondary, ...typography.label, marginTop: spacing.xs }}>Meal timing</Text>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          {(["Before food", "After food"] as const).map((t) => (
            <Chip key={t} label={t} selected={meal === t} onPress={() => setMeal(meal === t ? "none" : t)} />
          ))}
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Add a note" maxLength={400} />
        <TextField label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" maxLength={10} />
        <TextField
          label="End date (optional)"
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          error={dateError}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Reminders on</Text>
          <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: colors.accent, false: colors.border }} />
        </View>
      </Card>

      <Button label="Save medication" loading={save.isPending} disabled={!canSave} onPress={() => save.mutate()} />
      {existing ? (
        <Button
          label="Delete medication"
          variant="secondary"
          loading={remove.isPending}
          onPress={() =>
            Alert.alert("Delete medication?", "Its reminders and dose history will be removed.", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => remove.mutate() },
            ])
          }
        />
      ) : null}
      <View style={{ height: radius.xs }} />
    </ScreenContainer>
  );
}
