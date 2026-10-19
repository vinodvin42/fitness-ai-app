import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { colors } from "../theme/tokens";

/**
 * Keyboard / switch-access / D-pad focus for shared pressables.
 * Touch never triggers focus on native, so this only shows for people who
 * navigate without touching the screen.
 */
export function useFocusState<E = unknown>(onFocus?: (e: E) => void, onBlur?: (e: E) => void) {
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback((e: E) => {
    setFocused(true);
    onFocus?.(e);
  }, [onFocus]);
  const handleBlur = useCallback((e: E) => {
    setFocused(false);
    onBlur?.(e);
  }, [onBlur]);
  return { focused, focusProps: { onFocus: handleFocus, onBlur: handleBlur } };
}

/**
 * 2 px ring in the `focus` token (>= 3:1 on canvas, card, raised and muted
 * in both themes). Default: drawn 3 px outside the control, so the parent
 * must not clip. Pass a negative `offset` to draw it inside instead, for
 * controls that sit edge to edge (segments, rows in a grouped card).
 */
export function FocusRing({ visible, radius, offset = 5 }: { visible: boolean; radius: number; offset?: number }) {
  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: -offset, left: -offset, right: -offset, bottom: -offset, borderRadius: Math.max(0, radius + offset), borderWidth: 2, borderColor: colors.focus }}
    />
  );
}
