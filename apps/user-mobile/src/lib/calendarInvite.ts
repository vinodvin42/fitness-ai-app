import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { buildIcs, type CalendarEvent } from "./ics";

/**
 * "Add to calendar" for a booked session (Figma coach/08; 25 Oct 2026). Native: writes an .ics file
 * and opens the share sheet, where the member picks their calendar app. Web: downloads the file.
 * No calendar permission is needed either way. Returns false when the phone can't share files.
 */
export async function addToCalendar(event: CalendarEvent): Promise<boolean> {
  const ics = buildIcs(event);
  const filename = `fynrox-session-${event.uid.slice(0, 8)}.ics`;
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  }
  if (!(await Sharing.isAvailableAsync())) return false;
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, ics);
  await Sharing.shareAsync(uri, { mimeType: "text/calendar", UTI: "public.calendar-event", dialogTitle: "Add to calendar" });
  return true;
}
