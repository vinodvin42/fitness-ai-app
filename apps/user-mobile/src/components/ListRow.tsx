import React from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, IconName } from "./Icon";
import { Card } from "./Card";
import { colors, radius, spacing, typography } from "../theme/tokens";

interface ListRowProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  tint?: string;
  tintSoft?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  style?: object;
}

/**
 * Card-based list row — icon-left / content-middle / action-right
 * (docs/mobile/04-design-system.md §5). The dominant row shape across the
 * app (routine/exercise/coach/recipe/nav rows). Added 31 Aug 2026.
 */
export function ListRow({
  icon,
  title,
  subtitle,
  tint = colors.accent,
  tintSoft = colors.accentSoft,
  right,
  onPress,
  style,
}: ListRowProps) {
  const body = (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, ...(style ?? {}) }}>
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.md,
            backgroundColor: tintSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={20} color={tint} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, ...typography.h3 }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: colors.textSecondary, ...typography.meta, marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      {right !== undefined ? right : onPress ? <Icon name="chevron-right" size={20} color={colors.textMuted} /> : null}
    </Card>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}
