import { Alert, Platform } from "react-native";

/**
 * Dialogs that also work on web. react-native-web's `Alert.alert` is a no-op,
 * and the coach app ships as a web app, so a bare `Alert.alert` there silently
 * swallowed every confirmation (Decline could never be confirmed) and every
 * error. On web these use the browser's own `confirm`/`alert`; on native they
 * are the same `Alert.alert` calls as before. Mirrors apps/user-mobile's
 * `lib/confirm.ts`.
 */

function joined(title: string, message?: string): string {
  return message ? `${title}\n\n${message}` : title;
}

/** Cancel / confirm dialog; `onConfirm` runs only if the coach confirms. */
export function confirmAction(
  title: string,
  message: string | undefined,
  confirmLabel: string,
  onConfirm: () => void,
  destructive = true,
) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(joined(title, message))) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}

/** A notice or error with a single OK; `onDismiss` runs once it is closed. */
export function showAlert(title: string, message?: string, onDismiss?: () => void) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(joined(title, message));
    onDismiss?.();
    return;
  }
  Alert.alert(title, message, onDismiss ? [{ text: "OK", onPress: onDismiss }] : undefined);
}
