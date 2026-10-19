import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { formatSetValues, formatWeight, type SetValues } from "../lib/fastLogging";
import { colors, fonts, radius, spacing, typography, themed } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const WEIGHT_STEP_KG = 2.5;
const RPE_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export type QuickEditSetType = "normal" | "drop" | "failure";
const SET_TYPES: Array<{ value: QuickEditSetType; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "drop", label: "Drop set" },
  { value: "failure", label: "To failure" },
];

export interface QuickEditValue {
  weight: string;
  reps: string;
  rpe?: number;
  /** Batch 3b: only returned when the sheet was given a setType. */
  setType?: QuickEditSetType;
}

interface SetQuickEditSheetProps {
  visible: boolean;
  title: string;
  value: QuickEditValue;
  /** This session's previous logged set of the exercise ("Same as last set"). */
  lastSet?: SetValues;
  /** The same set in the previous session ("Last time: 24 × 10"). */
  lastTime?: SetValues;
  /** RPE is offered for working sets only; it is never required to log. */
  showRpe: boolean;
  /** Batch 3b (18 Oct 2026): show the Normal / Drop set / To failure choice, starting from this value. */
  setType?: QuickEditSetType;
  onDone: (value: QuickEditValue) => void;
  onClose: () => void;
}

/** Figma log/06: adjust one set with steppers, copy the last set, optional RPE. */
export function SetQuickEditSheet({ visible, title, value, lastSet, lastTime, showRpe, setType, onDone, onClose }: SetQuickEditSheetProps) {
  const { colors: theme } = useTheme();
  const [weight, setWeight] = useState(value.weight);
  const [reps, setReps] = useState(value.reps);
  const [rpe, setRpe] = useState<number | undefined>(value.rpe);
  const [type, setChosenType] = useState<QuickEditSetType>(setType ?? "normal");

  useEffect(() => {
    if (!visible) return;
    setWeight(value.weight);
    setReps(value.reps);
    setRpe(value.rpe);
    setChosenType(setType ?? "normal");
  }, [visible, value.weight, value.reps, value.rpe, setType]);

  const stepWeight = (delta: number) => {
    const next = Math.max(0, (parseFloat(weight) || 0) + delta);
    setWeight(next > 0 ? formatWeight(next) : "");
  };
  const stepReps = (delta: number) => setReps(String(Math.max(1, (parseInt(reps, 10) || 0) + delta)));
  const apply = (v: SetValues) => {
    setWeight(v.weightKg != null ? formatWeight(v.weightKg) : "");
    setReps(String(v.reps));
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.row}>
        <StepButton label={`−${WEIGHT_STEP_KG}`} a11y={`Minus ${WEIGHT_STEP_KG} kilograms`} onPress={() => stepWeight(-WEIGHT_STEP_KG)} />
        <View style={[styles.field, { borderColor: theme.accent }]}>
          <TextInput
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Weight in kilograms"
            style={styles.input}
          />
          <Text style={styles.unit}>kg</Text>
        </View>
        <StepButton label={`+${WEIGHT_STEP_KG}`} a11y={`Plus ${WEIGHT_STEP_KG} kilograms`} onPress={() => stepWeight(WEIGHT_STEP_KG)} />
      </View>
      <View style={styles.row}>
        <StepButton label="−1" a11y="One rep fewer" onPress={() => stepReps(-1)} />
        <View style={styles.field}>
          <TextInput
            value={reps}
            onChangeText={setReps}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Reps"
            style={styles.input}
          />
          <Text style={styles.unit}>reps</Text>
        </View>
        <StepButton label="+1" a11y="One more rep" onPress={() => stepReps(1)} />
      </View>

      {lastSet || lastTime ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {lastSet ? (
            <Pressable
              onPress={() => apply(lastSet)}
              accessibilityRole="button"
              accessibilityLabel={`Same as last set, ${formatSetValues(lastSet)}`}
              style={[styles.chip, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}
            >
              <Text style={{ color: theme.accentText, ...typography.label, fontSize: 13 }}>Same as last set</Text>
            </Pressable>
          ) : null}
          {lastTime ? (
            <Pressable
              onPress={() => apply(lastTime)}
              accessibilityRole="button"
              accessibilityLabel={`Use last time's numbers, ${formatSetValues(lastTime)}`}
              style={styles.chip}
            >
              <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 13 }}>Last time: {formatSetValues(lastTime)}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {setType !== undefined ? (
        <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: spacing.sm }}>
          {SET_TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => setChosenType(t.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: type === t.value }}
              style={[styles.chip, type === t.value ? { borderColor: theme.accent, backgroundColor: theme.accentSoft } : null]}
            >
              <Text style={{ color: type === t.value ? theme.accentText : colors.textSecondary, ...typography.label, fontSize: 13 }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showRpe ? (
        <>
          <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 13, marginTop: spacing.xs }}>
            RPE <Text style={{ color: colors.textMuted, fontFamily: fonts.body }}>Optional · not needed to log</Text>
          </Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {RPE_SCALE.map((n) => (
              <Pressable
                key={n}
                onPress={() => setRpe(rpe === n ? undefined : n)}
                accessibilityRole="button"
                accessibilityLabel={`Effort ${n} of 10`}
                accessibilityState={{ selected: rpe === n }}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: rpe === n ? theme.accent : colors.surfaceRaised,
                }}
              >
                <Text style={{ color: rpe === n ? theme.textOnAccent : colors.textSecondary, fontSize: 13, fontFamily: fonts.bodySemi }}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Button
        label="Done"
        disabled={!(parseInt(reps, 10) > 0)}
        onPress={() =>
          onDone({ weight: weight.trim(), reps: String(parseInt(reps, 10)), rpe: showRpe ? rpe : undefined, setType: setType !== undefined ? type : undefined })
        }
        style={{ marginTop: spacing.sm }}
      />
    </BottomSheet>
  );
}

function StepButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={4} style={styles.step}>
      <Text style={{ color: colors.textPrimary, ...typography.label, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  field: {
    flex: 1,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  input: { minWidth: 48, textAlign: "center", color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 20 },
  unit: { color: colors.textSecondary, fontSize: 15 },
  step: {
    width: 56,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
} as const));
