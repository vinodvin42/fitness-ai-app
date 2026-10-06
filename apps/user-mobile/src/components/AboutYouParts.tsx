import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "./Icon";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { colors, fonts, radius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Whole years between a YYYY-MM-DD date of birth and today (local calendar). */
export function ageFromDob(dob: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1;
  return age;
}

/** "15 Jan 1995" for a YYYY-MM-DD string. */
export function formatDob(dob: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Returns an error message, or null when `day/month/year` form a real, past date. */
export function validateDobParts(day: string, month: string, year: string, now: Date = new Date()): string | null {
  const d = Number(day);
  const mo = Number(month);
  const y = Number(year);
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) return "Enter day, month and a 4-digit year";
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "That date doesn't exist";
  if (date.getTime() > now.getTime()) return "Date of birth can't be in the future";
  if (now.getFullYear() - y > 120) return "Enter a valid year";
  return null;
}

export function toDobString(day: string, month: string, year: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

interface DateOfBirthCardProps {
  value: string | undefined;
  onChange: (dob: string) => void;
  /** Shown under the card when the age is below the minimum (13). */
  error?: string | null;
}

/** Figma About You "Date of birth" card: formatted date, computed Age badge, and the under-18 info note. */
export function DateOfBirthCard({ value, onChange, error }: DateOfBirthCardProps) {
  const { colors: theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const age = value ? ageFromDob(value) : null;

  const openSheet = () => {
    if (value) {
      const [y, m, d] = value.split("-");
      setYear(y);
      setMonth(String(Number(m)));
      setDay(String(Number(d)));
    }
    setFormError(null);
    setOpen(true);
  };

  const save = () => {
    const err = validateDobParts(day, month, year);
    if (err) {
      setFormError(err);
      return;
    }
    onChange(toDobString(day, month, year));
    setOpen(false);
  };

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Pressable
          onPress={Platform.OS === "web" ? undefined : openSheet}
          accessibilityRole="button"
          accessibilityLabel={value ? `Date of birth ${formatDob(value)}. Change` : "Select date of birth"}
          style={{ flex: 1, position: "relative" }}
        >
          <Text style={styles.eyebrow}>DATE OF BIRTH</Text>
          <Text style={[styles.dob, !value && { color: colors.textMuted }]}>{value ? formatDob(value) : "Select date"}</Text>
          {Platform.OS === "web"
            ? // Web: an invisible native date input over the text opens the browser's own picker.
              React.createElement("input", {
                type: "date",
                "aria-label": "Date of birth",
                value: value ?? "",
                min: "1900-01-01",
                max: new Date().toISOString().slice(0, 10),
                onChange: (e: { target: { value: string } }) => {
                  const v = e.target.value;
                  if (v && validateDobParts(String(Number(v.slice(8, 10))), String(Number(v.slice(5, 7))), v.slice(0, 4)) === null) onChange(v);
                },
                style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0 },
              })
            : null}
        </Pressable>
        <View style={{ alignItems: "flex-start", minWidth: 56 }}>
          <Text style={styles.ageLabel}>Age</Text>
          <Text style={[styles.age, { color: theme.accent }]}>{age != null && age >= 0 ? age : "–"}</Text>
          <Text style={styles.ageLabel}>{age == null ? "" : age < 18 ? "Under 18" : "Adult"}</Text>
        </View>
      </View>
      <View style={[styles.note, { backgroundColor: theme.accentSoft }]}>
        <Icon name="info" size={14} color={theme.accent} />
        <Text style={styles.noteText}>Users under 18 need a parent/guardian review and consent before proceeding.</Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12, fontFamily: fonts.body }}>
          {error}
        </Text>
      ) : null}

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Date of birth">
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <DobInput label="Day" value={day} onChangeText={setDay} maxLength={2} placeholder="DD" />
          <DobInput label="Month" value={month} onChangeText={setMonth} maxLength={2} placeholder="MM" />
          <DobInput label="Year" value={year} onChangeText={setYear} maxLength={4} placeholder="YYYY" flex={1.6} />
        </View>
        {formError ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12, fontFamily: fonts.body }}>
            {formError}
          </Text>
        ) : null}
        <Button label="Save" onPress={save} />
      </BottomSheet>
    </View>
  );
}

function DobInput({
  label,
  value,
  onChangeText,
  maxLength,
  placeholder,
  flex = 1,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  maxLength: number;
  placeholder: string;
  flex?: number;
}) {
  return (
    <View style={{ flex }}>
      <Text style={styles.eyebrow}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, ""))}
        keyboardType="number-pad"
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={styles.dobInput}
      />
    </View>
  );
}

interface MeasureCardProps {
  label: string;
  /** Display string for the large value, or null for the unset placeholder. */
  display: string | null;
  placeholder: string;
  units: [string, string];
  unitIndex: 0 | 1;
  onUnitChange: (i: 0 | 1) => void;
  onDecrement: () => void;
  onIncrement: () => void;
}

/** Figma weight/height card: label, unit toggle, big value, round -/+ steppers. */
export function MeasureCard({ label, display, placeholder, units, unitIndex, onUnitChange, onDecrement, onIncrement }: MeasureCardProps) {
  const { colors: theme } = useTheme();
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.eyebrow}>{label.toUpperCase()}</Text>
        <View style={styles.toggle} accessibilityRole="tablist">
          {units.map((u, i) => {
            const active = unitIndex === i;
            return (
              <Pressable
                key={u}
                onPress={() => onUnitChange(i as 0 | 1)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label} in ${u}`}
                style={[styles.toggleItem, active && { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.toggleText, active && { color: theme.textOnAccent }]}>{u}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <StepButton icon="minus" label={`Decrease ${label}`} onPress={onDecrement} />
        <Text accessibilityLabel={`${label}: ${display ?? "not set"}`} style={[styles.value, display == null && { color: colors.textMuted }]}>
          {display ?? placeholder}
        </Text>
        <StepButton icon="plus" label={`Increase ${label}`} onPress={onIncrement} />
      </View>
    </View>
  );
}

function StepButton({ icon, label, onPress }: { icon: "minus" | "plus"; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.stepBtn}>
      <Icon name={icon} size={18} color={colors.textPrimary} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 12,
  },
  eyebrow: { color: colors.textMuted, fontSize: 10, letterSpacing: 0.8, fontFamily: fonts.bodyMedium },
  dob: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayBold, marginTop: 4 },
  ageLabel: { color: colors.textSecondary, fontSize: 10, fontFamily: fonts.body },
  age: { fontSize: 20, fontFamily: fonts.displayBold, marginVertical: 2 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  noteText: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 15, fontFamily: fonts.body },
  dobInput: {
    marginTop: 4,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontFamily: fonts.bodySemi,
    textAlign: "center",
  },
  toggle: { flexDirection: "row", backgroundColor: colors.surfaceRaised, borderRadius: 6, padding: 2 },
  toggleItem: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 5 },
  toggleText: { color: colors.textSecondary, fontSize: 10, fontFamily: fonts.bodySemi },
  value: { color: colors.textPrimary, fontSize: 34, fontFamily: fonts.displayBold, letterSpacing: -0.5 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
