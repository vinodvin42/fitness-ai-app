import React from "react";
import { Text, View } from "react-native";
import { Icon } from "./Icon";
import { FYNROX_PROGRAMS } from "../content/fynroxPrograms";
import { formatRupees } from "../lib/money";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

/**
 * The four Fynrox programs (content/fynroxPrograms.ts) on My plan and the
 * Workouts > Programs tab: who each
 * is for, its goal, its length and its price (incl. GST). Programs are
 * bought separately, not part of any plan; there is no buy button until a
 * purchase flow is agreed.
 */
export function FynroxProgramsSection() {
  const { colors: theme } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, ...typography.h2 }}>
        Fynrox programs
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Bought separately: programs are not part of Basic or Prime.</Text>
      {FYNROX_PROGRAMS.map((p) => (
        <View
          key={p.key}
          accessible
          accessibilityLabel={`${p.name}, ${p.duration}, ${formatRupees(p.priceCents)} including GST. For ${p.forWhom}. ${p.goal}`}
          style={{
            flexDirection: "row",
            gap: spacing.md,
            backgroundColor: colors.surface,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={p.icon} size={20} color={theme.accentText} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
              <Text style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 15 }}>{p.name}</Text>
              <Text style={{ color: theme.accentText, fontFamily: fonts.bodySemi, fontSize: 12 }}>{p.duration}</Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{p.goal}</Text>
            <Text style={{ color: colors.textMuted, ...typography.meta }}>For: {p.forWhom}</Text>
            <Text style={{ color: colors.textPrimary, fontFamily: fonts.bodySemi, fontSize: 13 }}>
              {formatRupees(p.priceCents)} incl. GST
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
