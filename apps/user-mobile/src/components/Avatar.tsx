import React from "react";
import { Image, Text, View } from "react-native";
import { colors, fonts, radius } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

interface AvatarProps {
  name?: string | null;
  uri?: string | null;
  size?: number;
}

function initialsOf(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Round avatar: the image when `uri` is given, otherwise the user's initials. */
export function Avatar({ name, uri, size = 40 }: AvatarProps) {
  const { colors: theme } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} avatar` : "Avatar"}
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceHigh,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ color: theme.accent, fontFamily: fonts.displaySemi, fontSize: size * 0.38 }}>{initialsOf(name)}</Text>
      )}
    </View>
  );
}
