import React from "react";
import { Pressable, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors } from "../theme/tokens";

/**
 * Round 40 dp header button (back, search, notifications, settings). One look
 * on every screen (design consistency pass, 25 Oct 2026); hitSlop brings the
 * touch area to 48 dp.
 */
export function HeaderIconButton({
  icon,
  label,
  onPress,
  badge,
  iconColor,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Small red dot, e.g. unread notifications. */
  badge?: boolean;
  iconColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon name={icon} size={18} color={iconColor ?? colors.textPrimary} />
      {badge ? (
        <View
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.danger,
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </Pressable>
  );
}
