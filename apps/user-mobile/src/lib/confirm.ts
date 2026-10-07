import { Alert, Platform } from "react-native";

/**
 * Confirm dialog that also works on web (react-native-web's Alert.alert is a
 * no-op there, which silently swallowed destructive confirmations).
 */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void, destructive = true) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}
