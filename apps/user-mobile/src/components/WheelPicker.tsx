import React, { useRef } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import { colors, fonts, radius, spacing } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const ROW_H = 34;
const DRAG_STEP_PX = 26;

/**
 * One three-row spinner column (previous / current / next), Figma medicine/01
 * "Time". Works without native deps: tap the faint rows, or drag/swipe
 * vertically (touch or mouse) to spin. Pure presentation — the parent owns
 * the value and supplies the neighbours via `previous`/`next` labels.
 */
export function WheelColumn({
  previous,
  current,
  next,
  onStep,
  label,
  width = 64,
}: {
  previous: string;
  current: string;
  next: string;
  /** -1 = scroll to the previous value, +1 = next. */
  onStep: (delta: -1 | 1) => void;
  label: string;
  width?: number;
}) {
  const acc = useRef(0);
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        acc.current = 0;
      },
      onPanResponderMove: (_e, g) => {
        // Dragging down reveals earlier values (like a physical wheel).
        const steps = Math.trunc((g.dy - acc.current) / DRAG_STEP_PX);
        if (steps !== 0) {
          acc.current += steps * DRAG_STEP_PX;
          const dir = steps > 0 ? -1 : 1;
          for (let i = 0; i < Math.abs(steps); i++) stepRef.current(dir);
        }
      },
    }),
  ).current;

  const faint = { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 16, textAlign: "center" as const };
  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}: ${current}`}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      style={{ width, alignItems: "stretch" }}
    >
      <Pressable onPress={() => onStep(-1)} style={{ height: ROW_H, justifyContent: "center" }} accessibilityLabel={`Previous ${label}`}>
        <Text style={faint}>{previous}</Text>
      </Pressable>
      <View style={{ height: ROW_H + 6, justifyContent: "center" }}>
        <Text
          style={{ color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 28, textAlign: "center" }}
          accessibilityLiveRegion="polite"
        >
          {current}
        </Text>
      </View>
      <Pressable onPress={() => onStep(1)} style={{ height: ROW_H, justifyContent: "center" }} accessibilityLabel={`Next ${label}`}>
        <Text style={faint}>{next}</Text>
      </Pressable>
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Wheel-style "HH : MM  AM|PM" time picker over a 24h "HH:MM" value. */
export function TimeWheel({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const { colors: theme } = useTheme();
  const [h24, m] = value.split(":").map((v) => Number(v));
  const isPm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const emit = (nextH24: number, nextM: number) => onChange(`${pad((nextH24 + 24) % 24)}:${pad(((nextM % 60) + 60) % 60)}`);
  const to12 = (h: number) => ((((h - 1) % 12) + 12) % 12) + 1;
  const setH12 = (next12: number) => emit((next12 % 12) + (isPm ? 12 : 0), m);
  const MIN_STEP = 5;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
      }}
    >
      <WheelColumn
        label="Hour"
        previous={pad(to12(h12 - 1))}
        current={pad(h12)}
        next={pad(to12(h12 + 1))}
        onStep={(d) => setH12(to12(h12 + d))}
      />
      <Text style={{ color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 24, marginHorizontal: -4 }}>:</Text>
      <WheelColumn
        label="Minute"
        previous={pad((m - MIN_STEP + 60) % 60)}
        current={pad(m)}
        next={pad((m + MIN_STEP) % 60)}
        onStep={(d) => emit(h24, m + d * MIN_STEP)}
      />
      <View style={{ flexDirection: "row", backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, padding: 3 }}>
        {(["AM", "PM"] as const).map((p) => {
          const selected = (p === "PM") === isPm;
          return (
            <Pressable
              key={p}
              onPress={() => emit(p === "PM" ? (h24 % 12) + 12 : h24 % 12, m)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={p}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: selected ? theme.accent : "transparent",
              }}
            >
              <Text style={{ color: selected ? colors.textOnAccent : colors.textSecondary, fontFamily: fonts.bodySemi, fontSize: 13 }}>{p}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysIn(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

/** Wheel-style day / month / year picker over a "YYYY-MM-DD" value. */
export function DateWheel({ value, onChange }: { value: string; onChange: (ymd: string) => void }) {
  const [y, mo, d] = value.split("-").map((v) => Number(v));
  const month0 = mo - 1;
  const emit = (ny: number, nm0: number, nd: number) => {
    const m0 = ((nm0 % 12) + 12) % 12;
    const clamped = Math.min(nd, daysIn(ny, m0));
    onChange(`${ny}-${pad(m0 + 1)}-${pad(clamped)}`);
  };
  const dim = daysIn(y, month0);
  const wrapDay = (n: number) => ((((n - 1) % dim) + dim) % dim) + 1;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
      }}
    >
      <WheelColumn label="Day" previous={pad(wrapDay(d - 1))} current={pad(d)} next={pad(wrapDay(d + 1))} onStep={(s) => emit(y, month0, wrapDay(d + s))} width={56} />
      <WheelColumn
        label="Month"
        previous={MONTHS[(month0 + 11) % 12]}
        current={MONTHS[month0]}
        next={MONTHS[(month0 + 1) % 12]}
        onStep={(s) => emit(y + (month0 + s > 11 ? 1 : month0 + s < 0 ? -1 : 0), month0 + s, d)}
        width={72}
      />
      <WheelColumn label="Year" previous={String(y - 1)} current={String(y)} next={String(y + 1)} onStep={(s) => emit(y + s, month0, d)} width={72} />
    </View>
  );
}
