import React, { useEffect, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { colors } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

interface ValueSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Fires while dragging (local preview). */
  onChange?: (value: number) => void;
  /** Fires once when the user lets go (persist here). */
  onCommit: (value: number) => void;
  accessibilityLabel: string;
}

const THUMB = 18;

/** Minimal horizontal slider (pan or tap on the track). No native module needed, so it works on web too. */
export function ValueSlider({ value, min, max, step = 1, onChange, onCommit, accessibilityLabel }: ValueSliderProps) {
  const { colors: theme } = useTheme();
  const [width, setWidth] = useState(0);
  const [local, setLocal] = useState(value);
  const widthRef = useRef(0);
  const latest = useRef(value);
  const cb = useRef({ onChange, onCommit });
  cb.current = { onChange, onCommit };

  useEffect(() => {
    setLocal(value);
    latest.current = value;
  }, [value]);

  const toValue = (x: number) => {
    const w = widthRef.current - THUMB;
    if (w <= 0) return latest.current;
    const ratio = Math.min(1, Math.max(0, (x - THUMB / 2) / w));
    const raw = min + ratio * (max - min);
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  };
  const update = (x: number) => {
    const v = toValue(x);
    if (v !== latest.current) {
      latest.current = v;
      setLocal(v);
      cb.current.onChange?.(v);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => update(e.nativeEvent.locationX),
      onPanResponderMove: (e) => update(e.nativeEvent.locationX),
      onPanResponderRelease: () => cb.current.onCommit(latest.current),
      onPanResponderTerminate: () => cb.current.onCommit(latest.current),
    }),
  ).current;

  const ratio = (local - min) / (max - min || 1);
  const left = ratio * Math.max(0, width - THUMB);

  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: local }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const next = Math.min(max, Math.max(min, local + (e.nativeEvent.actionName === "increment" ? step : -step)));
        latest.current = next;
        setLocal(next);
        cb.current.onCommit(next);
      }}
      style={{ height: 28, justifyContent: "center" }}
    >
      <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: colors.border }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.accent, width: left + THUMB / 2 }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: colors.textPrimary,
          borderWidth: 3,
          borderColor: theme.accent,
        }}
      />
    </View>
  );
}
