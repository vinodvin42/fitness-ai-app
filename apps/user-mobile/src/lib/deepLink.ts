import type { MainTabsParamList } from "../navigation/MainTabs";
import type { NavigationProp } from "@react-navigation/native";

/**
 * Maps a server notification `deepLink` (an app-scheme URL or a bare path
 * such as "/recover/devices" or "primefit://more/medicine") onto a known
 * route. Returns false when the link isn't recognised so callers can just
 * mark the notification read and stay put — an unknown link never crashes.
 */
export function openNotificationDeepLink(
  navigation: NavigationProp<MainTabsParamList>,
  deepLink: string | null | undefined,
): boolean {
  if (!deepLink) return false;
  const path = deepLink
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
  const [head, second] = path.split("/");

  switch (head) {
    case "today":
      navigation.navigate("Today");
      return true;
    case "train":
    case "workouts":
      navigation.navigate("Train");
      return true;
    case "fuel":
    case "nutrition":
      navigation.navigate("Fuel");
      return true;
    case "recover":
    case "recovery":
      if (second === "devices") navigation.navigate("Recover", { screen: "ConnectedDevices" });
      else if (second === "yoga" || second === "mobility") navigation.navigate("Recover", { screen: "YogaLibrary" });
      else if (second === "breathing") navigation.navigate("Recover", { screen: "GuidedBreathing", params: {} });
      else navigation.navigate("Recover", { screen: "RecoverHub" });
      return true;
    case "medicine":
    case "medication":
    case "medications":
      navigation.navigate("More", { screen: second === "due" ? "MedicineDue" : "MedicationList" });
      return true;
    case "reminders":
      navigation.navigate("More", { screen: "Reminders" });
      return true;
    case "ai-coach":
    case "coach-ai":
      navigation.navigate("Recover", { screen: "AiCoach" });
      return true;
    case "coaching":
    case "messages":
    case "coach":
      navigation.navigate("More", { screen: "Conversations" });
      return true;
    case "billing":
    case "subscription":
      navigation.navigate("More", { screen: "Subscription" });
      return true;
    case "settings":
      navigation.navigate("More", { screen: "SettingsHub" });
      return true;
    default:
      return false;
  }
}
