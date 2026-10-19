import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { SegmentedControl } from "./SegmentedControl";
import { BARS, PLATES, plateLoad, formatWeight, type PlateUnit } from "../lib/fastLogging";
import { kgToLb, lbToKg } from "../lib/measureUnits";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/** Conventional plate colours (competition colour coding), kept the same in both themes. */
const PLATE_COLOUR: Record<number, { bg: string; fg: string }> = {
  25: { bg: "#d64545", fg: "#ffffff" },
  45: { bg: "#d64545", fg: "#ffffff" },
  20: { bg: "#2f6fe0", fg: "#ffffff" },
  35: { bg: "#2f6fe0", fg: "#ffffff" },
  15: { bg: "#e3b51b", fg: "#1a1a1a" },
  10: { bg: "#2e9e5b", fg: "#ffffff" },
  5: { bg: "#f2f2f2", fg: "#1a1a1a" },
  2.5: { bg: "#4a4f55", fg: "#ffffff" },
  1.25: { bg: "#a7adb3", fg: "#1a1a1a" },
};

/**
 * Figma log/05: which plates to put on each side of the bar. The app has no
 * per-gym plate inventory, so it starts from a standard set; tapping a plate
 * leaves it out of the calculation (on this screen only).
 */
export function PlateCalculatorSheet({
  visible,
  initialKg,
  onUse,
  onClose,
}: {
  visible: boolean;
  /** The weight currently entered for the set, in kg. */
  initialKg?: number;
  onUse: (kg: number) => void;
  onClose: () => void;
}) {
  const { colors: theme } = useTheme();
  const [unit, setUnit] = useState<PlateUnit>("kg");
  const [bar, setBar] = useState<number>(BARS.kg[0]);
  const [target, setTarget] = useState("");
  const [off, setOff] = useState<number[]>([]);

  useEffect(() => {
    if (!visible) return;
    setUnit("kg");
    setBar(BARS.kg[0]);
    setOff([]);
    setTarget(initialKg && initialKg > 0 ? formatWeight(initialKg) : "");
  }, [visible, initialKg]);

  const switchUnit = (next: PlateUnit) => {
    if (next === unit) return;
    const t = parseFloat(target);
    setTarget(t > 0 ? formatWeight(Math.round((next === "lb" ? kgToLb(t) : lbToKg(t)) * 2) / 2) : "");
    setBar(BARS[next][0]);
    setOff([]);
    setUnit(next);
  };

  const available = PLATES[unit].filter((p) => !off.includes(p));
  const targetNum = parseFloat(target);
  const load = targetNum > 0 ? plateLoad(targetNum, bar, available) : null;
  const loadedKg = load ? (unit === "kg" ? load.loaded : Math.round(lbToKg(load.loaded) * 10) / 10) : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Plate calculator">
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: colors.textPrimary, ...typography.h3 }}>Barbell</Text>
          <TextInput
            value={target}
            onChangeText={setTarget}
            keyboardType="decimal-pad"
            placeholder="—"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={`Target weight in ${unit}`}
            style={{
              minWidth: 72,
              height: 40,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: theme.accent,
              backgroundColor: colors.surfaceRaised,
              paddingHorizontal: spacing.sm,
              color: colors.textPrimary,
              fontFamily: fonts.bodyBold,
              fontSize: 18,
              textAlign: "center",
            }}
          />
          <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{unit}</Text>
        </View>
        <SegmentedControl
          options={[
            { value: "kg", label: "kg" },
            { value: "lb", label: "lb" },
          ]}
          value={unit}
          onChange={(v) => switchUnit(v as PlateUnit)}
        />
      </View>

      <Text style={{ color: colors.textMuted, ...typography.meta }}>Bar</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {BARS[unit].map((b) => (
          <Pressable
            key={b}
            onPress={() => setBar(b)}
            accessibilityRole="button"
            accessibilityLabel={`Bar ${b} ${unit}`}
            accessibilityState={{ selected: bar === b }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: bar === b ? theme.accent : colors.border,
              backgroundColor: bar === b ? theme.accentSoft : "transparent",
            }}
          >
            <Text style={{ color: bar === b ? theme.accentText : colors.textSecondary, ...typography.label, fontSize: 13 }}>
              {b} {unit}
            </Text>
          </Pressable>
        ))}
      </View>

      <View
        accessibilityLabel={load ? `Each side: ${load.perSide.map(formatWeight).join(" plus ") || "no plates"}` : undefined}
        style={{
          minHeight: 64,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceRaised,
          padding: spacing.md,
          justifyContent: "center",
        }}
      >
        {!(targetNum > 0) ? (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Enter the total weight, bar included.</Text>
        ) : !load ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            That's less than the {bar} {unit} bar.
          </Text>
        ) : (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
              Each side: <Text style={{ fontFamily: fonts.bodyBold, fontSize: 18 }}>{load.perSide.length ? load.perSide.map(formatWeight).join(" + ") : "no plates"}</Text>
            </Text>
            {!load.exact ? (
              <Text style={{ color: colors.warningText, fontSize: 13 }}>
                Closest with these plates: {formatWeight(load.loaded)} {unit}.
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {PLATES[unit].map((p) => {
          const isOff = off.includes(p);
          const c = PLATE_COLOUR[p] ?? { bg: colors.surfaceHigh, fg: colors.textPrimary };
          return (
            <Pressable
              key={p}
              onPress={() => setOff(isOff ? off.filter((x) => x !== p) : [...off, p])}
              accessibilityRole="button"
              accessibilityLabel={`${p} ${unit} plate, ${isOff ? "left out" : "available"}`}
              accessibilityState={{ selected: !isOff }}
              style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: c.bg, opacity: isOff ? 0.3 : 1 }}
            >
              <Text style={{ color: c.fg, fontFamily: fonts.bodyBold, fontSize: 13, textDecorationLine: isOff ? "line-through" : "none" }}>
                {formatWeight(p)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.textMuted, ...typography.meta }}>Standard plates. Tap a plate your gym doesn't have to leave it out.</Text>

      <Button
        label={load && loadedKg != null ? `Use ${formatWeight(loadedKg)} kg` : "Use this weight"}
        disabled={!load || loadedKg == null}
        onPress={() => {
          if (loadedKg != null) onUse(loadedKg);
          onClose();
        }}
        style={{ marginTop: spacing.sm }}
      />
    </BottomSheet>
  );
}
