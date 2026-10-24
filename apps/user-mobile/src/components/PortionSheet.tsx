import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { FoodEstimateItem } from "@fitness-ai-app/types";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import {
  PORTION_GUIDE,
  UNIT_CHIP_LABELS,
  asUnit,
  convertAmount,
  formatAmount,
  portionText,
  quickAmounts,
  rescale,
  stepFor,
  unitOptions,
  type PortionUnit,
} from "../lib/indianPortions";
import { useTheme } from "../theme/ThemeProvider";
import { colors, fonts, radius, spacing } from "../theme/tokens";

/**
 * Figma fuel/11 "Indian portions": pick a unit (katori, bowl, cup,
 * tablespoon, grams — or roti/piece for counted food), step the amount in
 * halves, see the portion's nutrition, and check the Indian portion guide.
 * Works on an itemised AI estimate item; nutrition scales by grams.
 */
export function PortionSheet({
  item,
  onClose,
  onApply,
}: {
  item: FoodEstimateItem | null;
  onClose: () => void;
  onApply: (next: FoodEstimateItem) => void;
}) {
  const { colors: theme } = useTheme();
  const [unit, setUnit] = useState<PortionUnit>("katori");
  const [amount, setAmount] = useState(1);
  useEffect(() => {
    if (!item) return;
    setUnit(asUnit(item.unit));
    setAmount(item.amount);
  }, [item]);

  if (!item) return <BottomSheet visible={false} onClose={onClose} title="">{null}</BottomSheet>;
  const next = rescale(item, amount, unit);
  const step = stepFor(unit);
  const switchUnit = (u: PortionUnit) => {
    const current = rescale(item, amount, unit);
    setAmount(convertAmount(current, u));
    setUnit(u);
  };

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.accent : colors.border,
        backgroundColor: selected ? theme.accent : colors.surfaceRaised,
      }}
    >
      <Text style={{ color: selected ? theme.textOnAccent : colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
  const tile = (value: string, label: string, color: string) => (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surfaceRaised }}>
      <Text style={{ color, fontFamily: fonts.bodyBold, fontSize: 16 }}>{value}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );

  return (
    <BottomSheet visible onClose={onClose} title={item.name} closeIcon gap={14} paddingX={20}>
      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: -6 }}>Portion</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {unitOptions(item).map((u) => chip(UNIT_CHIP_LABELS[u], u === unit, () => switchUnit(u)))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceRaised }}>
        <Pressable
          onPress={() => setAmount((a) => Math.max(step, Math.round((a - step) / step) * step))}
          accessibilityRole="button"
          accessibilityLabel="Less"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 20 }}>−</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }} accessible accessibilityLabel={`${portionText(amount, unit)}, about ${next.grams} grams`}>
          <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodyBold, fontSize: 20 }}>{portionText(amount, unit)}</Text>
          {unit !== "g" && unit !== "ml" ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>about {next.grams} g</Text> : null}
        </View>
        <Pressable
          onPress={() => setAmount((a) => Math.round((a + step) / step) * step)}
          accessibilityRole="button"
          accessibilityLabel="More"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: theme.textOnAccent, fontFamily: fonts.bodyBold, fontSize: 20 }}>+</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {quickAmounts(unit).map((q) => chip(formatAmount(q, unit), Math.abs(q - amount) < 1e-6, () => setAmount(q)))}
      </View>

      <View style={{ gap: 8, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 12 }}>For {portionText(amount, unit)}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {tile(String(next.calories), "kcal", colors.textPrimary)}
          {tile(`${next.proteinG} g`, "Protein", theme.accentText)}
          {tile(`${next.carbsG} g`, "Carbs", colors.successText)}
          {tile(`${next.fatG} g`, "Fat", colors.warningText)}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Estimates vary with recipe and oil. Switch to grams if you weighed it.</Text>
      </View>

      <View style={{ gap: 6, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>Indian portion guide</Text>
        {PORTION_GUIDE.map((g) => (
          <View key={g.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{g.label}</Text>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{g.value}</Text>
          </View>
        ))}
      </View>

      <Button label="Use this portion" onPress={() => onApply(next)} style={{ marginBottom: spacing.sm }} />
    </BottomSheet>
  );
}
