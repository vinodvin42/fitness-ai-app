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
  const query = new URLSearchParams(deepLink.includes("?") ? deepLink.replace(/#.*$/, "").slice(deepLink.indexOf("?") + 1) : "");
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
      // "train/form-analysis": a coach reviewed a form-check clip.
      if (second === "form-analysis") navigation.navigate("Train", { screen: "FormAnalysis", initial: false });
      else navigation.navigate("Train");
      return true;
    case "fuel":
    case "nutrition":
      navigation.navigate("Fuel");
      return true;
    case "recover":
    case "recovery":
      if (second === "devices") navigation.navigate("Recover", { screen: "ConnectedDevices", initial: false });
      else if (second === "yoga" || second === "mobility") navigation.navigate("Recover", { screen: "YogaLibrary", initial: false });
      else if (second === "breathing") navigation.navigate("Recover", { screen: "GuidedBreathing", params: {}, initial: false });
      else navigation.navigate("Recover", { screen: "RecoverHub" });
      return true;
    case "medicine":
    case "medication":
    case "medications":
      {
        // Params are case-sensitive ids/ISO strings, so read them from the original (not lower-cased) link.
        const medicationId = query.get("medicationId");
        const scheduledFor = query.get("scheduledFor");
        if (second === "due" && medicationId && scheduledFor) {
          navigation.navigate("More", { screen: "MedicineOccurrence", params: { medicationId, scheduledFor }, initial: false });
        } else {
          navigation.navigate("More", { screen: second === "due" ? "MedicineDue" : "MedicationList", initial: false });
        }
      }
      return true;
    case "reminders":
      navigation.navigate("More", { screen: "Reminders", initial: false });
      return true;
    case "ai-coach":
    case "coach-ai":
      navigation.navigate("Recover", { screen: "AiCoach", initial: false });
      return true;
    case "coaching":
    case "messages":
    case "coach":
    case "coach-messages":
      navigation.navigate("More", { screen: "Conversations", initial: false });
      return true;
    case "coach-request":
      {
        // e.g. fynrox://coach-request?relationshipId=… ("coach accepted / declined your request", 26 Oct 2026).
        const relationshipId = query.get("relationshipId");
        if (relationshipId) navigation.navigate("More", { screen: "RequestStatus", params: { relationshipId }, initial: false });
        else navigation.navigate("More", { screen: "Conversations", initial: false });
      }
      return true;
    case "billing":
    case "subscription":
      navigation.navigate("More", { screen: "Subscription", initial: false });
      return true;
    case "payments":
    case "purchases":
      // "Payment received" notices.
      navigation.navigate("More", { screen: "Purchases", initial: false });
      return true;
    case "settings":
      navigation.navigate("More", { screen: "SettingsHub", initial: false });
      return true;
    case "learn":
      {
        // e.g. fynrox://learn?slug=… (05.04 Educational Content, Oct 2026).
        const slug = query.get("slug");
        if (slug) navigation.navigate("More", { screen: "LearnArticle", params: { slug }, initial: false });
        else navigation.navigate("More", { screen: "Learn", initial: false });
      }
      return true;
    case "support":
    case "help":
      {
        // e.g. fynrox://support/tickets?ticketId=… (complaint notices, Oct 2026).
        const ticketId = query.get("ticketId");
        if (ticketId) navigation.navigate("More", { screen: "SupportTicketDetail", params: { ticketId }, initial: false });
        else navigation.navigate("More", { screen: "Support", initial: false });
      }
      return true;
    default:
      return false;
  }
}
