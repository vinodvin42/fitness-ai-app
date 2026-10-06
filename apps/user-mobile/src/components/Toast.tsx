import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, elevation, radius, spacing, typography } from "../theme/tokens";

export type ToastTone = "info" | "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}
interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

const TONE_COLOR: Record<ToastTone, string> = { info: colors.aiAccent, success: colors.success, error: colors.danger };

/** Mount once near the app root; call `useToast().show("Saved", "success")` from anywhere below. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const counter = useRef(0);
  const show = useCallback((message: string, tone: ToastTone = "info") => {
    counter.current += 1;
    setToast({ id: counter.current, message, tone });
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  const clear = useCallback((id: number) => setToast((t) => (t?.id === id ? null : t)), []);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastView key={toast.id} item={toast} onDone={clear} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onDone(item.id));
    }, 3200);
    return () => clearTimeout(t);
  }, [opacity, onDone, item.id]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{ position: "absolute", left: spacing.md, right: spacing.md, top: insets.top + spacing.sm, opacity }}
    >
      <View
        accessibilityRole="alert"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          backgroundColor: colors.surfaceHigh,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          padding: spacing.md,
          ...elevation.floating,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TONE_COLOR[item.tone] }} />
        <Text style={{ flex: 1, color: colors.textPrimary, ...typography.label }}>{item.message}</Text>
      </View>
    </Animated.View>
  );
}
