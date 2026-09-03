import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * A thin wrapper around `expo-secure-store`, needed for the same reason as
 * apps/user-mobile/src/lib/secureStore.ts: `expo-secure-store`'s web target
 * is a literal empty stub, so calling it on web throws synchronously and
 * crashes AuthProvider's launch-time token check before the app ever
 * renders — this exists purely so this sandbox's headless web-export
 * verification doesn't crash on launch (no iOS Simulator exists here). On
 * iOS this delegates straight through to the real, Keychain-backed
 * implementation; only web falls back to plain, unencrypted `localStorage`.
 */
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
