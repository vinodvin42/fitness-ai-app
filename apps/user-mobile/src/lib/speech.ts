import { Platform } from "react-native";
import * as Speech from "expo-speech";

/**
 * Spoken cues (Oct 2026). expo-speech uses the phone's own text-to-speech on Android and iOS, and
 * the browser's speechSynthesis on the web. Before this, voice worked on the web build only.
 * Speech is a nice-to-have: every call here swallows errors, so a phone without a voice installed
 * never breaks a workout.
 */
export function speechAvailable(): boolean {
  if (Platform.OS !== "web") return true;
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Speaks `text`, cutting off anything still being said. */
export function speak(text: string): void {
  if (!speechAvailable()) return;
  try {
    void Speech.stop().catch(() => undefined);
    Speech.speak(text, { rate: 1.0 });
  } catch {
    // optional
  }
}

export function stopSpeech(): void {
  if (!speechAvailable()) return;
  try {
    void Speech.stop().catch(() => undefined);
  } catch {
    // optional
  }
}
