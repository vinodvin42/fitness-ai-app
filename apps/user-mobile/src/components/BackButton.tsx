import React from "react";
import { View } from "react-native";
import { HeaderIconButton } from "./HeaderIconButton";

/**
 * Back button for stack screens. Prefer ScreenContainer's `onBack`, which puts
 * it beside the title; where a screen still places it in its content, it has
 * the same round look (design consistency pass, 25 Oct 2026).
 */
export function BackButton({ onPress, label = "Back" }: { onPress: () => void; label?: string }) {
  return (
    <View style={{ alignSelf: "flex-start" }}>
      <HeaderIconButton icon="chevron-left" label={label} onPress={onPress} />
    </View>
  );
}
