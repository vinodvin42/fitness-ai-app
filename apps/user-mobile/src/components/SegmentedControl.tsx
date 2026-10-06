import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors, fonts, radius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

/** Equal-width single-select segmented control. */
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors: theme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 3,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: spacing.sm,
              borderRadius: radius.sm,
              backgroundColor: selected ? theme.accent : "transparent",
            }}
          >
            <Text
              style={{
                color: selected ? theme.textOnAccent : colors.textSecondary,
                fontFamily: selected ? fonts.bodySemi : fonts.bodyMedium,
                fontSize: 13,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
