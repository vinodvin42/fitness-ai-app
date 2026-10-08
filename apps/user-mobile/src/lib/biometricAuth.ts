import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "./secureStore";

const BIOMETRIC_LOCK_ENABLED_KEY = "fynrox.biometricLockEnabled";
const BIOMETRIC_LOCK_IDLE_TIMEOUT_KEY = "fynrox.biometricLockIdleTimeoutMinutes";

/** The set of idle-timeout options SecurityScreen offers — "Immediately" (0) preserves the exact old always-lock-on-background behavior, so it's the default for anyone who never touches this setting. */
export const BIOMETRIC_LOCK_IDLE_TIMEOUT_OPTIONS = [0, 1, 5, 15, 30] as const;
export type BiometricLockIdleTimeoutMinutes = (typeof BIOMETRIC_LOCK_IDLE_TIMEOUT_OPTIONS)[number];

/**
 * Biometric Unlock (docs/mobile/03-screen-inventory.md §L Security,
 * "biometric login") — a real, client-only app-lock gate via
 * expo-local-authentication. Deliberately a per-device, not per-account,
 * setting: whether Face ID/Touch ID hardware exists (and is enrolled) is
 * a property of THIS device, not the signed-in user, so the on/off flag
 * lives in expo-secure-store (same storage mechanism api/client.ts uses
 * for the auth tokens) rather than as a `User` field synced from the
 * server. Turning it on on one device has no effect on any other device
 * the same account is signed into, which is the correct behavior for a
 * hardware-gated setting.
 *
 * 20 Aug 2026: a real, configurable **idle timeout** — closes gap §22's
 * "re-locks only on backgrounding, not on an idle timer" note. Also
 * per-device, same storage mechanism, same reasoning as the on/off flag
 * above. See `AuthContext.tsx`'s `AppState` listener for how the stored
 * minutes value is actually applied (there's no way to run a real timer
 * while iOS/Android has suspended a backgrounded app's JS — the standard,
 * correct approach, same one password-manager apps use, is comparing
 * elapsed time against this threshold at the moment the app returns to
 * the foreground, not counting down while backgrounded).
 */

/** True only if this device both has a fingerprint/face scanner AND has at least one enrolled. */
export async function isBiometricHardwareReady(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

export async function getBiometricLockEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(BIOMETRIC_LOCK_ENABLED_KEY);
  return value === "true";
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_LOCK_ENABLED_KEY, "true");
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_LOCK_ENABLED_KEY);
  }
}

/** Defaults to 0 ("Immediately") — the exact pre-20-Aug-2026 behavior — for any device that's never set this explicitly. */
export async function getBiometricLockIdleTimeoutMinutes(): Promise<BiometricLockIdleTimeoutMinutes> {
  const value = await SecureStore.getItemAsync(BIOMETRIC_LOCK_IDLE_TIMEOUT_KEY);
  const parsed = value ? parseInt(value, 10) : 0;
  return BIOMETRIC_LOCK_IDLE_TIMEOUT_OPTIONS.includes(parsed as BiometricLockIdleTimeoutMinutes)
    ? (parsed as BiometricLockIdleTimeoutMinutes)
    : 0;
}

export async function setBiometricLockIdleTimeoutMinutes(minutes: BiometricLockIdleTimeoutMinutes): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_LOCK_IDLE_TIMEOUT_KEY, String(minutes));
}

/**
 * Prompts Face ID / Touch ID. expo-local-authentication falls back to the
 * device passcode automatically after a few failed biometric attempts
 * (its default `disableDeviceFallback: false`), so this never strands a
 * user who's enrolled a face/fingerprint but is temporarily unrecognized.
 */
export async function promptBiometricUnlock(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage });
  return result.success;
}
