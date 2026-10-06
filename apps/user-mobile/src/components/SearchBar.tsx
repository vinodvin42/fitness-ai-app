import React from "react";
import { TextInput, View } from "react-native";
import { Icon } from "./Icon";
import { colors, radius, spacing } from "../theme/tokens";

interface SearchBarProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** Pill-shaped variant (Figma Today 03). */
  pill?: boolean;
  /** Trailing slot, e.g. the Today 03 mic icon. */
  right?: React.ReactNode;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
}

/** Icon + input search field, used across list screens. Added 31 Aug 2026. */
export function SearchBar({ value, onChangeText, placeholder = "Search", pill, right, onSubmitEditing, autoFocus }: SearchBarProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        height: 50,
        borderRadius: pill ? radius.pill : radius.md,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceRaised,
        paddingHorizontal: spacing.md,
      }}
    >
      <Icon name="search" size={18} color={colors.textMuted} />
      <TextInput
        style={{ flex: 1, color: colors.textPrimary, fontSize: 15 }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        accessibilityLabel={placeholder}
        accessibilityRole="search"
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
      />
      {right}
    </View>
  );
}
