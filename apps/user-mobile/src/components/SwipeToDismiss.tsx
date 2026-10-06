import React, { useMemo, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, PanResponder, Platform, Pressable, Text, View } from "react-native";
import { Icon } from "./Icon";
import { colors, radius } from "../theme/tokens";

interface SwipeToDismissProps {
  onDismiss: () => void;
  children: React.ReactNode;
  /** Accessible name of the dismiss control, e.g. "Dismiss Workout Reminder". */
  dismissLabel?: string;
}

const DISMISS_THRESHOLD = 90;

/**
 * Swipe-left-to-dismiss row (Figma Today 02 "Swipe left to dismiss a
 * notification"). Drag handling is PanResponder + Animated so it works on
 * native and on web (mouse/touch drag). Web users also get a visible "x"
 * button because a mouse drag is not discoverable. Vertical scrolling is left
 * alone: the responder only claims clearly-horizontal leftward moves.
 */
export function SwipeToDismiss({ onDismiss, children, dismissLabel = "Dismiss" }: SwipeToDismissProps) {
  const x = useRef(new Animated.Value(0)).current;
  const widthRef = useRef(320);
  const [gone, setGone] = useState(false);

  const finish = () => {
    setGone(true);
    onDismiss();
  };

  const slideOut = () => {
    Animated.timing(x, { toValue: -widthRef.current, duration: 180, useNativeDriver: Platform.OS !== "web" }).start(finish);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          if (g.dx < 0) x.setValue(g.dx);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dx < -DISMISS_THRESHOLD || g.vx < -0.9) slideOut();
          else Animated.spring(x, { toValue: 0, useNativeDriver: Platform.OS !== "web" }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: Platform.OS !== "web" }).start(),
      }),
    [x],
  );

  if (gone) return null;

  return (
    <View onLayout={(e: LayoutChangeEvent) => (widthRef.current = e.nativeEvent.layout.width)} style={{ borderRadius: radius.card, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.dangerSoft, alignItems: "flex-end", justifyContent: "center", paddingRight: 24 }}
      >
        <Text style={{ color: colors.danger, fontSize: 12 }}>Dismiss</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...responder.panHandlers}>
        {children}
        {Platform.OS === "web" ? (
          <Pressable
            onPress={slideOut}
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
            hitSlop={8}
            style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceHigh }}
          >
            <Icon name="x" size={12} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
