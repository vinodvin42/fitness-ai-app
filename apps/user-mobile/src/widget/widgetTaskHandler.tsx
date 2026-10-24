import React from "react";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { fetchTodayWaterLogs, logWater } from "../api/nutrition";
import { queryClient } from "../lib/queryClient";
import {
  TODAY_WIDGET_NAME,
  WIDGET_WATER_GLASSES,
  readTodayWidgetSnapshot,
  todayWidgetView,
  widgetDay,
  writeTodayWidgetSnapshot,
  type TodayWidgetSnapshot,
} from "../lib/todayWidget";
import { LOG_WATER_ACTION, TodayWidget } from "./TodayWidget";

/**
 * Runs headless (registered in index.js, Android only) whenever Android asks
 * for the widget: added, resized, the 30-minute refresh, or a tap. It draws
 * the snapshot Today saved. Tapping the widget opens the app (OPEN_APP, handled
 * natively); "+250 ml" logs one glass with the member's saved sign-in and then
 * re-reads today's total, so the widget matches the app.
 */
export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetInfo.widgetName !== TODAY_WIDGET_NAME) return;
  const draw = (snapshot: TodayWidgetSnapshot | null, notice?: string) =>
    renderWidget(<TodayWidget view={todayWidgetView(snapshot, new Date(), notice)} height={widgetInfo.height} />);

  switch (widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
      draw(await readTodayWidgetSnapshot());
      return;
    case "WIDGET_CLICK": {
      if (clickAction !== LOG_WATER_ACTION) return;
      const snapshot = await readTodayWidgetSnapshot();
      // The button only shows on today's snapshot; a stale tap just redraws.
      if (!snapshot || snapshot.date !== widgetDay(new Date())) {
        draw(snapshot);
        return;
      }
      try {
        await logWater({ glasses: WIDGET_WATER_GLASSES });
      } catch {
        draw(snapshot, "Couldn't log · open Fynrox");
        return;
      }
      // If the app is open in the background, Today and Food refetch water instead of showing the old total.
      void queryClient.invalidateQueries({ queryKey: ["waterLogs"] });
      let glasses = snapshot.water.glasses + WIDGET_WATER_GLASSES;
      try {
        glasses = (await fetchTodayWaterLogs()).reduce((sum, w) => sum + w.glasses, 0);
      } catch {
        // Logged; keep the local count.
      }
      const next: TodayWidgetSnapshot = { ...snapshot, updatedAt: new Date().toISOString(), water: { ...snapshot.water, glasses } };
      await writeTodayWidgetSnapshot(next);
      draw(next);
      return;
    }
    default:
      // WIDGET_DELETED: nothing to clean up; the snapshot is shared by every Today widget.
      return;
  }
}
