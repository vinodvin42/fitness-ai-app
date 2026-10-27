import { Alert, Platform } from "react-native";

/**
 * Confirm dialog that also works on web (react-native-web's Alert.alert is a
 * no-op there, which silently swallowed destructive confirmations).
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  destructive = true,
  // When the action itself is a "cancel" (cancelling a session), "Cancel" as
  // the way out reads ambiguously, so the caller can name it ("Keep session").
  dismissLabel = "Cancel",
) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: dismissLabel, style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}
