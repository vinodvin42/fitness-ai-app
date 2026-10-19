import React from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Icon, type IconName } from "./Icon";
import { colors, radius, spacing, typography } from "../theme/tokens";

export interface ExerciseMenuItem {
  key: string;
  label: string;
  icon: IconName;
  /** Right-hand value, e.g. "90 s". */
  value?: string;
  onPress: () => void;
}

/** Figma log/07: one exercise's actions, opened from its ⋯ button. Only actions the app supports are passed in. */
export function ExerciseMenuSheet({
  visible,
  title,
  items,
  footnote,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: ExerciseMenuItem[];
  footnote?: string;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
        {items.map((item, i) => (
          <Pressable
            key={item.key}
            onPress={() => {
              onClose();
              item.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={item.value ? `${item.label}, ${item.value}` : item.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: 14,
              backgroundColor: colors.surfaceRaised,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <Icon name={item.icon} size={18} color={colors.textSecondary} />
            <Text style={{ flex: 1, color: colors.textPrimary, ...typography.body, fontSize: 15 }}>{item.label}</Text>
            {item.value ? <Text style={{ color: colors.textSecondary, ...typography.label, fontSize: 13 }}>{item.value}</Text> : null}
            <Icon name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
      {footnote ? <Text style={{ color: colors.textMuted, ...typography.meta }}>{footnote}</Text> : null}
    </BottomSheet>
  );
}
