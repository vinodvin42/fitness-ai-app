import * as Linking from "expo-linking";
import * as secureStore from "./secureStore";

/**
 * Reset Password deep-link capture (R1 Developer 1, 18 Sep 2026, gap
 * §53) — the mobile-side half of Forgot/Reset Password. Follows the
 * exact same capture-then-consume approach src/lib/acquisitionContext.ts
 * already established for this app, and for the same underlying reason:
 * RootNavigator.tsx is a conditional switch between four entirely
 * separate root components (Auth/Onboarding/Lock/Main), not one
 * navigator a single static `NavigationContainer` `linking` config can
 * cleanly target. So the incoming URL is captured directly via
 * expo-linking (App.tsx, independent of React Navigation's own routing)
 * the moment the app launches or receives one while running, and stored
 * until AuthStack's own SplashScreen (its initialRouteName, so it's the
 * first thing that mounts whenever the user is signed out — exactly when
 * a real password-reset link is opened) checks for it and navigates
 * straight to ResetPasswordScreen.
 *
 * Unlike acquisitionContext's "first-touch only, never overwrites"
 * rule, a reset-password capture DOES overwrite any previously-stored
 * token — a user who requests a second reset link (their first attempt
 * expired, or they mistyped the new password and starts over) expects
 * the newest link to be the one that works, not a stale one from
 * earlier in the same session.
 *
 * URL shape recognized: `fynrox://reset-password?token=<token>` (see
 * apps/api's auth.service.ts forgotPassword(), the one place that
 * builds this exact link).
 */

const STORAGE_KEY = "pendingResetPasswordToken";

/** Parses a `fynrox://reset-password?token=...` URL into the raw token. Returns null for any URL that isn't this shape; never throws on a malformed URL. */
export function parseResetPasswordToken(url: string): string | null {
  let parsed: ReturnType<typeof Linking.parse>;
  try {
    parsed = Linking.parse(url);
  } catch {
    return null;
  }

  if (parsed.path !== "reset-password") return null;
  const token = parsed.queryParams?.token;
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  if (!trimmed) return null;

  return trimmed;
}

/** Parses and persists a URL's reset token, if any — overwrites any previously-stored one. No-op for a URL that doesn't match. */
export async function captureResetPasswordToken(url: string): Promise<void> {
  const token = parseResetPasswordToken(url);
  if (!token) return;
  await secureStore.setItemAsync(STORAGE_KEY, token);
}

export async function getStoredResetPasswordToken(): Promise<string | null> {
  return secureStore.getItemAsync(STORAGE_KEY);
}

/** Called once SplashScreen has consumed a stored token (navigated to ResetPasswordScreen with it) — a stale value must never re-trigger that redirect on a later app launch. */
export async function clearStoredResetPasswordToken(): Promise<void> {
  await secureStore.deleteItemAsync(STORAGE_KEY);
}
