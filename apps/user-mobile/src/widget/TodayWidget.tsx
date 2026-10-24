import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { BRAND_NAME } from "../lib/brand";
import type { TodayWidgetView } from "../lib/todayWidget";

/**
 * Figma widgets/02-android ("Today · Workout · Water · Protein", 4×2): the
 * brand line, then Workout, Water (with "+250 ml") and Protein rows. Colours
 * are Figma's; a home-screen widget can't follow the in-app theme.
 *
 * These are react-native-android-widget primitives, not React Native views:
 * the tree is turned into Android RemoteViews, so no hooks and no fragments.
 * Tapping anywhere opens the app; "+250 ml" logs a glass (widgetTaskHandler).
 */
const C = {
  background: "#F7F9FF",
  row: "#E8EEFF",
  accent: "#2563EB",
  text: "#111827",
  muted: "#6B7280",
  onAccent: "#FFFFFF",
} as const;

export const LOG_WATER_ACTION = "LOG_WATER";

function Row({ label, value, quickAdd, compact }: { label: string; value: string; quickAdd?: string | null; compact: boolean }) {
  return (
    <FlexWidget
      style={{
        width: "match_parent",
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.row,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: compact ? 4 : 6,
      }}
    >
      <FlexWidget style={{ flex: 1, flexDirection: compact ? "row" : "column", alignItems: compact ? "center" : "flex-start" }}>
        <TextWidget text={label} style={{ fontSize: 11, color: C.muted, ...(compact ? { width: 58 } : {}) }} />
        <TextWidget text={value} maxLines={1} truncate="END" style={{ fontSize: compact ? 13 : 14, fontWeight: "600", color: C.text }} />
      </FlexWidget>
      {quickAdd ? (
        <FlexWidget
          clickAction={LOG_WATER_ACTION}
          style={{ backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, marginLeft: 8 }}
        >
          <TextWidget text={quickAdd} style={{ fontSize: 12, fontWeight: "600", color: C.onAccent }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

export function TodayWidget({ view, height }: { view: TodayWidgetView; height?: number }) {
  // Launchers differ in cell height; below ~170 dp the label goes beside the value.
  const compact = height != null && height < 170;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        backgroundColor: C.background,
        borderRadius: 28,
        padding: compact ? 10 : 16,
        flexGap: compact ? 4 : 6,
      }}
    >
      <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", marginBottom: compact ? 0 : 4 }}>
        <FlexWidget
          style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: C.accent, alignItems: "center", justifyContent: "center", marginRight: 6 }}
        >
          <TextWidget text="X" style={{ fontSize: 10, fontWeight: "bold", color: C.onAccent }} />
        </FlexWidget>
        <TextWidget text={BRAND_NAME} style={{ fontSize: 13, fontWeight: "600", color: C.accent }} />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={view.note ?? "Today"} maxLines={1} truncate="END" style={{ fontSize: 12, color: C.muted }} />
      </FlexWidget>
      {view.rows.map((r) => (
        <Row key={r.label} label={r.label} value={r.value} quickAdd={r.label === "Water" ? view.quickAdd : null} compact={compact} />
      ))}
    </FlexWidget>
  );
}
