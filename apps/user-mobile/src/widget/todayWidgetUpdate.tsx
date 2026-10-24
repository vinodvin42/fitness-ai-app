import React, { useEffect } from "react";
import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import {
  TODAY_WIDGET_NAME,
  deleteTodayWidgetSnapshot,
  snapshotKey,
  todayWidgetView,
  writeTodayWidgetSnapshot,
  type TodayWidgetSnapshot,
} from "../lib/todayWidget";
import { TodayWidget } from "./TodayWidget";

/**
 * Keeps the Android Today widget in step with the app. Today calls
 * useTodayWidget() with its current numbers; an unchanged snapshot is not
 * rewritten. Every call is best-effort and does nothing off Android or when no
 * widget is on the home screen.
 */
let lastKey: string | null = null;

/** Redraws every Today widget on the home screen from `snapshot` (null = signed out / nothing yet). */
export async function renderTodayWidgets(snapshot: TodayWidgetSnapshot | null, notice?: string | null): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await requestWidgetUpdate({
      widgetName: TODAY_WIDGET_NAME,
      renderWidget: (info) => <TodayWidget view={todayWidgetView(snapshot, new Date(), notice)} height={info.height} />,
    });
  } catch {
    // Best-effort: the widget keeps its last picture.
  }
}

export async function publishTodayWidget(snapshot: TodayWidgetSnapshot): Promise<void> {
  if (Platform.OS !== "android") return;
  const key = snapshotKey(snapshot);
  if (key === lastKey) return;
  lastKey = key;
  await writeTodayWidgetSnapshot(snapshot);
  await renderTodayWidgets(snapshot);
}

/** Sign-out: forget the numbers and show the signed-out widget. */
export async function clearTodayWidget(): Promise<void> {
  if (Platform.OS !== "android") return;
  lastKey = null;
  await deleteTodayWidgetSnapshot();
  await renderTodayWidgets(null);
}

/**
 * Mounted once at the root: when the app settles signed out (sign-out, account
 * deletion, an expired session), the widget forgets the last member's numbers.
 * Pass false while auth is still loading, so a cold start never clears it.
 */
export function useClearTodayWidgetWhenSignedOut(signedOut: boolean): void {
  useEffect(() => {
    if (signedOut) void clearTodayWidget();
  }, [signedOut]);
}

/** Publishes `snapshot` whenever its content changes; pass null while Today is still loading. */
export function useTodayWidget(snapshot: TodayWidgetSnapshot | null): void {
  const key = snapshot ? snapshotKey(snapshot) : null;
  useEffect(() => {
    if (snapshot) void publishTodayWidget(snapshot);
    // `key` captures every field that matters; `snapshot` itself is a new object each render.
  }, [key]);
}
