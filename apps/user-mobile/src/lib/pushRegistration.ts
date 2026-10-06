import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { registerPushToken, unregisterPushToken } from "../api/notifications";

const TOKEN_KEY = "primefit.pushToken";

/**
 * Registers this device's Expo push token with the API. Every step is
 * best-effort: no push on web, a denied permission, a missing EAS projectId
 * (Expo Go / dev builds without one) or a network failure all resolve to
 * `null` instead of throwing — push is an enhancement, never a blocker.
 * Untested on a physical device (none available while this was written).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain && perm.status === "undetermined") {
      perm = await Notifications.requestPermissionsAsync();
    }
    if (!perm.granted) return null;

    const projectId =
      (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ?? Constants.easConfig?.projectId;
    const tokenResult = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tokenResult.data;
    if (!token) return null;

    await registerPushToken({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
    return token;
  } catch {
    return null;
  }
}

/** Best-effort: tells the API to stop pushing to this device. Call BEFORE the auth tokens are cleared. */
export async function unregisterPushNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await unregisterPushToken(token).catch(() => undefined);
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
  } catch {
    // ignore
  }
}
