import React from "react";
import { TextInput, View } from "react-native";
import { Icon } from "./Icon";
import { colors, radius, spacing } from "../theme/tokens";

interface SearchBarProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}

/** Icon + input search field, used across list screens. Added 31 Aug 2026. */
export function SearchBar({ value, onChangeText, placeholder = "Search" }: SearchBarProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        height: 50,
        borderRadius: radius.md,
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
      />
    </View>
  );
}
