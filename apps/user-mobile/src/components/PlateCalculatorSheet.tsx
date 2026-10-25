import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { SegmentedControl } from "./SegmentedControl";
import { BARS, PLATES, plateLoad, formatWeight, type PlateUnit } from "../lib/fastLogging";
import { kgToLb, lbToKg } from "../lib/measureUnits";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/** Conventional plate colours (competition colour coding, Figma log/05), kept the same in both themes. */
const PLATE_COLOUR: Record<number, { bg: string; fg: string }> = {
  25: { bg: "#dc2626", fg: "#ffffff" },
  45: { bg: "#dc2626", fg: "#ffffff" },
  20: { bg: "#2563eb", fg: "#ffffff" },
  35: { bg: "#2563eb", fg: "#ffffff" },
  15: { bg: "#eab308", fg: "#000000" },
  10: { bg: "#16a34a", fg: "#ffffff" },
  5: { bg: "#e4e4e7", fg: "#000000" },
  2.5: { bg: "#52525b", fg: "#ffffff" },
  1.25: { bg: "#a1a1aa", fg: "#000000" },
};
const STEEL = "#a1a1aa";

/** Plate height in the drawing: heavier plates are taller, as on a real bar. */
function plateHeight(p: number, unit: PlateUnit): number {
  const kg = unit === "kg" ? p : p / 2.2046;
  if (kg >= 20) return 104;
  if (kg >= 15) return 100;
  if (kg >= 10) return 84;
  if (kg >= 5) return 64;
  if (kg >= 2) return 48;
  return 40;
}

/** Figma log/05: the bar with each side's plates, heaviest next to the collar. */
function PlateGraphic({ perSide, unit }: { perSide: number[]; unit: PlateUnit }) {
  const narrow = perSide.length > 5;
  const plate = (p: number, i: number) => {
    const c = PLATE_COLOUR[p] ?? { bg: colors.surfaceHigh, fg: colors.textPrimary };
    const label = formatWeight(p);
    const width = (p >= (unit === "kg" ? 10 : 25) ? 22 : 18) * (narrow ? 0.65 : 1);
    return (
      <View key={i} style={{ width, height: plateHeight(p, unit), borderRadius: 4, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        {label.length <= 3 && !narrow ? <Text style={{ color: c.fg, fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 0.2 }}>{label}</Text> : null}
      </View>
    );
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 }}>
      <View style={{ width: 20, height: 10, borderRadius: 2, backgroundColor: STEEL }} />
      {[...perSide].reverse().map(plate)}
      <View style={{ width: 6, height: 22, borderRadius: 2, backgroundColor: STEEL }} />
      <View style={{ flex: 1, minWidth: 24, maxWidth: 110, height: 8, borderRadius: 2, backgroundColor: STEEL }} />
      <View style={{ width: 6, height: 22, borderRadius: 2, backgroundColor: STEEL }} />
      {perSide.map(plate)}
      <View style={{ width: 20, height: 10, borderRadius: 2, backgroundColor: STEEL }} />
    </View>
  );
}

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
              width: 88,
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
        <View style={{ width: 112 }}>
          <SegmentedControl
            options={[
              { value: "kg", label: "kg" },
              { value: "lb", label: "lb" },
            ]}
            value={unit}
            onChange={(v) => switchUnit(v as PlateUnit)}
          />
        </View>
      </View>
      {load ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: -6 }}>
          Bar {formatWeight(bar)} {unit} · {formatWeight((load.loaded - bar) / 2)} {unit} each side
        </Text>
      ) : null}

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
        accessible={!!load}
        accessibilityLabel={load ? `Each side: ${load.perSide.map(formatWeight).join(" plus ") || "no plates"}` : undefined}
        style={{
          minHeight: 64,
          borderRadius: 14,
          backgroundColor: colors.surfaceRaised,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.md,
          justifyContent: "center",
        }}
      >
        {!(targetNum > 0) ? (
          <Text style={{ color: colors.textMuted, fontSize: 13, paddingHorizontal: spacing.sm }}>Enter the total weight, bar included.</Text>
        ) : !load ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, paddingHorizontal: spacing.sm }}>
            That's less than the {bar} {unit} bar.
          </Text>
        ) : (
          <PlateGraphic perSide={load.perSide} unit={unit} />
        )}
      </View>
      {load ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 14 }}>Each side:</Text>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 18 }}>
              {load.perSide.length ? load.perSide.map(formatWeight).join(" + ") : "no plates"}
            </Text>
          </View>
          {!load.exact ? (
            <Text style={{ color: colors.warningText, fontSize: 13 }}>
              Closest with these plates: {formatWeight(load.loaded)} {unit}.
            </Text>
          ) : null}
        </View>
      ) : null}

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
              hitSlop={6}
              style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: c.bg, opacity: isOff ? 0.3 : 1 }}
            >
              <Text style={{ color: c.fg, fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.2, textDecorationLine: isOff ? "line-through" : "none" }}>
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
