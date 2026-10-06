import React, { useState } from "react";
import { Pressable, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { colors, fonts, radius, spacing, typography } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  error?: string | null;
  helper?: string;
  /** Adds a Show/Hide toggle and masks the value by default. */
  secure?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Labeled text input with error/helper text and an optional secure-entry toggle. */
export function TextField({ label, error, helper, secure, containerStyle, onFocus, onBlur, ...input }: TextFieldProps) {
  const { colors: theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? colors.danger : focused ? theme.accent : colors.border;
  return (
    <View style={containerStyle}>
      <Text style={{ color: colors.textSecondary, ...typography.label, marginBottom: spacing.xs }}>{label}</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
        }}
      >
        <TextInput
          {...input}
          accessibilityLabel={input.accessibilityLabel ?? label}
          secureTextEntry={secure ? !revealed : input.secureTextEntry}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{ flex: 1, minHeight: 48, color: colors.textPrimary, fontFamily: fonts.body, fontSize: 15 }}
        />
        {secure ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={8}
          >
            <Text style={{ color: theme.accent, ...typography.label }}>{revealed ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger, ...typography.meta, marginTop: spacing.xs }}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={{ color: colors.textMuted, ...typography.meta, marginTop: spacing.xs }}>{helper}</Text>
      ) : null}
    </View>
  );
}
