import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "./Icon";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { colors, fonts, radius, spacing, themed } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { HEIGHT_RANGE_CM, WEIGHT_RANGE_KG, cmToFeetInches, inToCm, kgToLb, lbToKg } from "../lib/measureUnits";

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
  /** Optional message shown under the card. */
  error?: string | null;
}

/** Figma About You "Date of birth" card: formatted date, computed Age badge, and an info note. */
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
          <Text style={[styles.age, { color: theme.accentText }]}>{age != null && age >= 0 ? age : "–"}</Text>
          <Text style={styles.ageLabel}>{age == null ? "" : age < 18 ? "Under 18" : "Adult"}</Text>
        </View>
      </View>
      <View style={[styles.note, { backgroundColor: theme.accentSoft }]}>
        <Icon name="info" size={14} color={theme.accent} />
        <Text style={styles.noteText}>We use your age to tailor your plan.</Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.dangerText, fontSize: 13, fontFamily: fonts.body }}>
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
          <Text accessibilityRole="alert" style={{ color: colors.dangerText, fontSize: 13, fontFamily: fonts.body }}>
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

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Keeps digits and a single decimal point; a comma (some Android keyboards) counts as the point. */
function cleanDecimal(raw: string): string {
  const s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = s.split(".");
  return rest.length ? `${whole}.${rest.join("")}` : whole;
}

/** The number in a typed string, or null while it is empty or half-typed ("."). */
function parseTyped(text: string): number | null {
  if (!/\d/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

interface MeasureCardProps {
  label: string;
  units: [string, string];
  unitIndex: 0 | 1;
  onUnitChange: (i: 0 | 1) => void;
  /** Short line under the value, e.g. the accepted range. */
  hint?: string;
  onDecrement?: () => void;
  onIncrement?: () => void;
  /** The typed input(s) — see MeasureInput. */
  children: React.ReactNode;
}

/** Figma weight/height card: label, unit toggle, a big typed value with small -/+ helpers either side. */
export function MeasureCard({ label, units, unitIndex, onUnitChange, hint, onDecrement, onIncrement, children }: MeasureCardProps) {
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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        {onDecrement ? <StepButton icon="minus" label={`Decrease ${label}`} onPress={onDecrement} /> : null}
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }}>{children}</View>
        {onIncrement ? <StepButton icon="plus" label={`Increase ${label}`} onPress={onIncrement} /> : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

interface MeasureInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder: string;
  /** Unit shown after the number ("kg", "ft"...). */
  suffix: string;
  keyboardType: "decimal-pad" | "number-pad";
  maxLength: number;
  accessibilityLabel: string;
}

/** A big number the user types directly, with its unit beside it. The placeholder is dimmed so it never reads as a saved value. */
export function MeasureInput({ value, onChangeText, onFocus, onBlur, placeholder, suffix, keyboardType, maxLength, accessibilityLabel }: MeasureInputProps) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER_COLOR}
        keyboardType={keyboardType}
        maxLength={maxLength}
        selectTextOnFocus
        accessibilityLabel={accessibilityLabel}
        style={styles.valueInput}
      />
      <Text style={styles.suffix}>{suffix}</Text>
    </View>
  );
}

interface WeightCardProps {
  valueKg: number | undefined;
  onChange: (kg: number | undefined) => void;
  /** 0 = kg, 1 = lb. Storage is always kg. */
  unitIndex: 0 | 1;
  onUnitChange: (i: 0 | 1) => void;
}

const weightText = (kg: number | undefined, lb: boolean) => (kg == null ? "" : String(round(lb ? kgToLb(kg) : kg, 1)));

/** Weight typed as a number (kg or lb), stored in kg, clamped to WEIGHT_RANGE_KG when the field loses focus. */
export function WeightCard({ valueKg, onChange, unitIndex, onUnitChange }: WeightCardProps) {
  const lb = unitIndex === 1;
  const [text, setText] = useState(() => weightText(valueKg, lb));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(weightText(valueKg, lb));
  }, [valueKg, lb, editing]);

  const onChangeText = (raw: string) => {
    const cleaned = cleanDecimal(raw);
    setText(cleaned);
    const n = parseTyped(cleaned);
    onChange(n == null ? undefined : round(lb ? lbToKg(n) : n, 2));
  };
  const onBlur = () => {
    setEditing(false);
    if (valueKg != null) onChange(round(clamp(valueKg, WEIGHT_RANGE_KG.min, WEIGHT_RANGE_KG.max), 2));
  };
  const step = (dir: 1 | -1) => {
    const next = round(clamp((valueKg ?? 70) + dir * (lb ? lbToKg(1) : 0.5), WEIGHT_RANGE_KG.min, WEIGHT_RANGE_KG.max), 2);
    onChange(next);
    setText(weightText(next, lb));
  };

  const range = lb
    ? `${Math.ceil(kgToLb(WEIGHT_RANGE_KG.min))}–${Math.floor(kgToLb(WEIGHT_RANGE_KG.max))} lb`
    : `${WEIGHT_RANGE_KG.min}–${WEIGHT_RANGE_KG.max} kg`;

  return (
    <MeasureCard
      label="Weight"
      units={["KG", "LBS"]}
      unitIndex={unitIndex}
      onUnitChange={onUnitChange}
      hint={`Type your weight (${range})`}
      onDecrement={() => step(-1)}
      onIncrement={() => step(1)}
    >
      <MeasureInput
        value={text}
        onChangeText={onChangeText}
        onFocus={() => setEditing(true)}
        onBlur={onBlur}
        placeholder={lb ? "e.g. 154" : "e.g. 70"}
        suffix={lb ? "lb" : "kg"}
        keyboardType="decimal-pad"
        maxLength={5}
        accessibilityLabel={lb ? "Weight in pounds" : "Weight in kilograms"}
      />
    </MeasureCard>
  );
}

interface HeightCardProps {
  valueCm: number | undefined;
  onChange: (cm: number | undefined) => void;
  /** 0 = cm, 1 = ft + in. Storage is always cm. */
  unitIndex: 0 | 1;
  onUnitChange: (i: 0 | 1) => void;
}

function heightTexts(cm: number | undefined) {
  if (cm == null) return { cm: "", ft: "", inch: "" };
  const parts = cmToFeetInches(cm);
  return { cm: String(Math.round(cm)), ft: String(parts.ft), inch: String(parts.inch) };
}

/** Height typed in cm, or in feet + inches, stored in cm, clamped to HEIGHT_RANGE_CM when a field loses focus. */
export function HeightCard({ valueCm, onChange, unitIndex, onUnitChange }: HeightCardProps) {
  const ftMode = unitIndex === 1;
  const [texts, setTexts] = useState(() => heightTexts(valueCm));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setTexts(heightTexts(valueCm));
  }, [valueCm, editing]);

  const onCmText = (raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    setTexts((prev) => ({ ...prev, cm: cleaned }));
    const n = parseTyped(cleaned);
    onChange(n == null ? undefined : n);
  };
  const onFeetInches = (ft: string, inch: string) => {
    setTexts((prev) => ({ ...prev, ft, inch }));
    const f = parseTyped(ft);
    const i = parseTyped(inch);
    onChange(f == null && i == null ? undefined : round(inToCm((f ?? 0) * 12 + (i ?? 0)), 1));
  };
  const onBlur = () => {
    setEditing(false);
    if (valueCm != null) onChange(round(clamp(valueCm, HEIGHT_RANGE_CM.min, HEIGHT_RANGE_CM.max), 1));
  };
  const step = (dir: 1 | -1) => {
    const next = round(clamp((valueCm ?? 170) + dir * (ftMode ? inToCm(1) : 1), HEIGHT_RANGE_CM.min, HEIGHT_RANGE_CM.max), 1);
    onChange(next);
    setTexts(heightTexts(next));
  };

  const lo = cmToFeetInches(HEIGHT_RANGE_CM.min);
  const hi = cmToFeetInches(HEIGHT_RANGE_CM.max);
  const range = ftMode ? `${lo.ft}'${lo.inch}" to ${hi.ft}'${hi.inch}"` : `${HEIGHT_RANGE_CM.min}–${HEIGHT_RANGE_CM.max} cm`;

  return (
    <MeasureCard
      label="Height"
      units={["CM", "FT"]}
      unitIndex={unitIndex}
      onUnitChange={onUnitChange}
      hint={`Type your height (${range})`}
      onDecrement={() => step(-1)}
      onIncrement={() => step(1)}
    >
      {ftMode ? (
        <>
          <MeasureInput
            value={texts.ft}
            onChangeText={(t) => onFeetInches(t.replace(/\D/g, ""), texts.inch)}
            onFocus={() => setEditing(true)}
            onBlur={onBlur}
            placeholder="5"
            suffix="ft"
            keyboardType="number-pad"
            maxLength={1}
            accessibilityLabel="Height, feet"
          />
          <MeasureInput
            value={texts.inch}
            onChangeText={(t) => onFeetInches(texts.ft, t.replace(/\D/g, ""))}
            onFocus={() => setEditing(true)}
            onBlur={onBlur}
            placeholder="7"
            suffix="in"
            keyboardType="number-pad"
            maxLength={2}
            accessibilityLabel="Height, inches"
          />
        </>
      ) : (
        <MeasureInput
          value={texts.cm}
          onChangeText={onCmText}
          onFocus={() => setEditing(true)}
          onBlur={onBlur}
          placeholder="e.g. 170"
          suffix="cm"
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel="Height in centimetres"
        />
      )}
    </MeasureCard>
  );
}

function StepButton({ icon, label, onPress }: { icon: "minus" | "plus"; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.stepBtn} hitSlop={4}>
      <Icon name={icon} size={18} color={colors.textPrimary} strokeWidth={2.5} />
    </Pressable>
  );
}

/** Dimmer than textMuted so an example value is never mistaken for a typed one (large text, so 3:1 is the bar). */
const PLACEHOLDER_COLOR = "rgba(152,162,179,0.55)";

const styles = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 12,
  },
  eyebrow: { color: colors.textMuted, fontSize: 13, letterSpacing: 0.8, fontFamily: fonts.bodyMedium },
  dob: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.displayBold, marginTop: 4 },
  ageLabel: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body },
  age: { fontSize: 20, fontFamily: fonts.displayBold, marginVertical: 2 },
  note: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  noteText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
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
  toggleItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 5 },
  toggleText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.bodySemi },
  inputWrap: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderStrong,
    paddingHorizontal: 4,
  },
  valueInput: {
    minWidth: 48,
    paddingVertical: 4,
    color: colors.textPrimary,
    fontSize: 34,
    fontFamily: fonts.displayBold,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  suffix: { color: colors.textSecondary, fontSize: 16, fontFamily: fonts.bodySemi },
  hint: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body, textAlign: "center" },
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
}));
