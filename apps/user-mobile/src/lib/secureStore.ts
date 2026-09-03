import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * A thin wrapper around `expo-secure-store`, added 20 Aug 2026 purely so
 * this app can be Metro-bundled for web and visually verified in this
 * headless cloud sandbox (no iOS Simulator or device exists here — see
 * apps/user-mobile/README.md's scaffold note). `expo-secure-store`'s own
 * web target is a literal empty stub (`export default {}`), so calling
 * `getItemAsync`/`setItemAsync`/`deleteItemAsync` on web throws
 * synchronously ("getValueWithKeyAsync is not a function") and crashes
 * AuthProvider's launch-time token check before the app ever renders past
 * its loading spinner.
 *
 * On iOS (and any other native platform), this delegates straight through
 * to the real `expo-secure-store` — behavior there is completely
 * unchanged, still Keychain-backed. **Only** on web does it fall back to
 * `localStorage` instead. This is explicitly NOT a real secure-storage
 * implementation — `localStorage` is plain, unencrypted browser storage —
 * and web was never a real target platform for this app (see `app.json`'s
 * own comment-equivalent in its README note); this fallback exists solely
 * so the dev-preview web build doesn't crash on launch, not to make
 * "store an auth token on web" a supported, secure feature.
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
