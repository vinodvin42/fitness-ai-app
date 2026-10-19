import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors, fonts, radius, spacing, touch } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { FocusRing, useFocusState } from "./FocusRing";

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** This one option can't be chosen right now (shown dimmed). */
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Whole control unavailable. */
  disabled?: boolean;
}

/** Equal-width single-select segmented control. */
export function SegmentedControl<T extends string>({ options, value, onChange, disabled }: SegmentedControlProps<T>) {
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
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {options.map((o) => (
        <Segment key={o.value} option={o} selected={o.value === value} disabled={disabled || o.disabled} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

function Segment<T extends string>({ option, selected, disabled, onPress }: { option: SegmentOption<T>; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors: theme } = useTheme();
  const { focused, focusProps } = useFocusState();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={option.label}
      hitSlop={{ top: 3, bottom: 3 }}
      android_ripple={{ color: colors.ripple }}
      {...focusProps}
      style={({ pressed }: { pressed: boolean }) => ({
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        // 42 + 3 px track padding top and bottom = 48 px touch target.
        minHeight: touch.min - 6,
        paddingVertical: spacing.sm,
        borderRadius: radius.sm,
        backgroundColor: selected ? theme.accent : "transparent",
        opacity: option.disabled && !selected ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      <FocusRing visible={focused} radius={radius.sm} offset={0} />
      <Text
        style={{
          color: selected ? theme.textOnAccent : colors.textSecondary,
          fontFamily: selected ? fonts.bodySemi : fonts.bodyMedium,
          fontSize: 14,
        }}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}
