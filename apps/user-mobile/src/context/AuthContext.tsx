import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AppState } from "react-native";
import type { DeleteAccountInput, LoginInput, SignupInput, UpdateProfileInput, User } from "@fitness-ai-app/types";
import { clearTokens, getStoredTokens, storeTokens } from "../api/client";
import { fetchMe, loginRequest, logoutRequest, signupRequest, verifyTwoFactorLoginRequest } from "../api/auth";
import { deleteAccount as deleteAccountRequest, updateProfile as updateProfileRequest } from "../api/users";
import { applyLanguagePreference } from "../i18n";
import {
  type BiometricLockIdleTimeoutMinutes,
  getBiometricLockEnabled,
  getBiometricLockIdleTimeoutMinutes,
  isBiometricHardwareReady,
  promptBiometricUnlock,
  setBiometricLockEnabled,
  setBiometricLockIdleTimeoutMinutes,
} from "../lib/biometricAuth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Drives RootNavigator's Auth -> Onboarding -> MainTabs switch. */
  onboardingCompleted: boolean;
  /**
   * §L "Security" — Two-Factor Authentication (25 Aug 2026, gap §17) made
   * this a two-outcome call: if the returned promise resolves with
   * `twoFactorRequired: true`, the password was correct but auth state
   * was NOT set — the caller (LoginScreen) must navigate to
   * TwoFactorChallengeScreen with the returned `twoFactorToken` and call
   * completeTwoFactorLogin below to actually finish signing in.
   */
  login: (input: LoginInput) => Promise<{ twoFactorRequired: boolean; twoFactorToken?: string }>;
  /** Finishes a login that returned `twoFactorRequired: true` above, using a code from the user's authenticator app (or a recovery code). */
  completeTwoFactorLogin: (twoFactorToken: string, code: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Call after the onboarding wizard's final step succeeds. */
  markOnboardingCompleted: () => void;
  /** View/Edit Profile + Preferences (docs/mobile/03-screen-inventory.md §N) — PATCHes apps/api, then syncs the in-memory user so every screen reflects it immediately. */
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  /** Re-fetches GET /users/me and syncs the in-memory user — used after an action that changes the User row through a call OTHER than updateProfile (e.g. SecurityScreen's 2FA enable/disable), which don't themselves return the full updated User. */
  refreshUser: () => Promise<void>;
  /**
   * Clears local session state WITHOUT calling the server — used after a
   * password change (which already revoked every server-side session as
   * part of that call, see api/users.ts's changePassword) so the client
   * doesn't also try to log out a refresh token it knows is already gone.
   */
  signOutLocally: () => Promise<void>;
  /** §L "Security" — a real account deletion. Signs out locally on success (the account, and its sessions, no longer exist server-side). */
  deleteAccount: (input: DeleteAccountInput) => Promise<void>;

  // ---- §L Security: Biometric Unlock (app-lock gate, see src/lib/biometricAuth.ts) ----
  /** True once this device's hardware/enrollment check has resolved (avoids flashing a toggle that can't work yet). */
  isBiometricHardwareChecked: boolean;
  /** True if this device has usable Face ID/Touch ID hardware AND at least one face/fingerprint enrolled. */
  isBiometricHardwareReady: boolean;
  /** The persisted, per-device on/off setting (expo-secure-store, not synced from the server — see biometricAuth.ts). */
  isBiometricLockEnabled: boolean;
  /** False while a lock is pending — RootNavigator renders LockScreen instead of MainTabs when this is false and the lock is enabled. */
  isUnlocked: boolean;
  /** Challenges Face ID/Touch ID before turning the lock on, so a user can't enable a setting that won't actually work. Returns whether it was turned on. */
  enableBiometricLock: () => Promise<boolean>;
  disableBiometricLock: () => Promise<void>;
  /** Challenges Face ID/Touch ID to clear a pending lock (used by LockScreen). Returns whether it succeeded. */
  unlock: () => Promise<boolean>;
  /** 0 ("Immediately") by default — how long the app can sit backgrounded before returning to it re-triggers LockScreen. Per-device, see biometricAuth.ts. */
  biometricLockIdleTimeoutMinutes: BiometricLockIdleTimeoutMinutes;
  setBiometricLockIdleTimeout: (minutes: BiometricLockIdleTimeoutMinutes) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);

  /**
   * The app's language follows the signed-in user's own
   * `languagePreference`, and this is the single place that happens.
   * Wrapping the setter rather than calling `applyLanguagePreference`
   * at each of the eight call sites means a future one cannot forget:
   * the language cannot drift from the user it belongs to.
   *
   * Signing out resets to English rather than leaving the previous
   * user's language on the sign-in screen for whoever picks up the
   * device next.
   */
  const setUser = useCallback((next: User | null) => {
    setUserState(next);
    applyLanguagePreference(next?.languagePreference ?? "en");
  }, []);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [isBiometricHardwareChecked, setIsBiometricHardwareChecked] = useState(false);
  const [isBiometricHardwareReadyState, setIsBiometricHardwareReadyState] = useState(false);
  const [isBiometricLockEnabled, setIsBiometricLockEnabledState] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [biometricLockIdleTimeoutMinutes, setBiometricLockIdleTimeoutState] =
    useState<BiometricLockIdleTimeoutMinutes>(0);
  // AppState's listener closes over stale state if it reads these directly
  // (the effect below only runs once) — mirror them into refs instead.
  const isBiometricLockEnabledRef = useRef(false);
  const idleTimeoutMinutesRef = useRef<BiometricLockIdleTimeoutMinutes>(0);
  // Set the instant the app leaves "active"; read (and cleared) the instant
  // it returns. There's no way to run a real countdown while iOS/Android
  // has suspended a backgrounded app's JS, so — same approach real
  // password-manager apps use — idle time is computed after the fact by
  // comparing this timestamp to now, right when the app comes back.
  const backgroundedAtRef = useRef<number | null>(null);

  // On launch: if a token is already stored, try to resolve the current
  // user (and onboarding status) so a returning user skips straight past
  // the Auth stack — and, if onboarding is still incomplete, past the
  // wizard step they already finished too. Runs the biometric
  // hardware/setting check in parallel — if Biometric Unlock is on,
  // isUnlocked starts false so RootNavigator shows LockScreen first.
  useEffect(() => {
    (async () => {
      const [{ accessToken }, hwReady, lockEnabled, idleTimeoutMinutes] = await Promise.all([
        getStoredTokens(),
        isBiometricHardwareReady(),
        getBiometricLockEnabled(),
        getBiometricLockIdleTimeoutMinutes(),
      ]);
      setIsBiometricHardwareReadyState(hwReady);
      setIsBiometricLockEnabledState(lockEnabled);
      setBiometricLockIdleTimeoutState(idleTimeoutMinutes);
      setIsUnlocked(!lockEnabled);
      setIsBiometricHardwareChecked(true);

      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        setUser(me.user);
        setOnboardingCompleted(me.onboardingCompleted);
      } catch {
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    isBiometricLockEnabledRef.current = isBiometricLockEnabled;
  }, [isBiometricLockEnabled]);

  useEffect(() => {
    idleTimeoutMinutesRef.current = biometricLockIdleTimeoutMinutes;
  }, [biometricLockIdleTimeoutMinutes]);

  // Re-lock based on how long the app actually sat backgrounded, not on
  // every single background/foreground blip — an app-lock that only
  // checked once at cold start would leave an already-open app fully
  // accessible to anyone who picks up the phone, but locking on every
  // momentary "inactive" (e.g. a system permission sheet) would be overly
  // aggressive for anyone who's chosen a non-zero idle timeout. With the
  // default 0-minute ("Immediately") timeout this reduces to the exact
  // old always-lock-on-background behavior, since elapsed time is always
  // >= 0.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (!isBiometricLockEnabledRef.current) return;

      if (nextState !== "active") {
        backgroundedAtRef.current = Date.now();
        return;
      }

      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (backgroundedAt == null) return;

      const idleMs = idleTimeoutMinutesRef.current * 60_000;
      if (Date.now() - backgroundedAt >= idleMs) {
        setIsUnlocked(false);
      }
    });
    return () => subscription.remove();
  }, []);

  const login = async (input: LoginInput) => {
    const result = await loginRequest(input);
    if (result.twoFactorRequired) {
      // Password verified, but auth state stays untouched until the
      // second factor clears too — see completeTwoFactorLogin below.
      return { twoFactorRequired: true as const, twoFactorToken: result.twoFactorToken };
    }
    await storeTokens(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
    setOnboardingCompleted(result.onboardingCompleted);
    return { twoFactorRequired: false as const };
  };

  const completeTwoFactorLogin = async (twoFactorToken: string, code: string) => {
    const { user: loggedInUser, tokens, onboardingCompleted: completed } = await verifyTwoFactorLoginRequest({
      twoFactorToken,
      code,
    });
    await storeTokens(tokens.accessToken, tokens.refreshToken);
    setUser(loggedInUser);
    setOnboardingCompleted(completed);
  };

  const signup = async (input: SignupInput) => {
    const { user: newUser, tokens, onboardingCompleted: completed } = await signupRequest(input);
    await storeTokens(tokens.accessToken, tokens.refreshToken);
    setUser(newUser);
    setOnboardingCompleted(completed); // always false for a brand-new account
  };

  const logout = async () => {
    const { refreshToken } = await getStoredTokens();
    if (refreshToken) {
      await logoutRequest(refreshToken).catch(() => {
        // Best-effort server-side revoke — clear local tokens regardless.
      });
    }
    await clearTokens();
    setUser(null);
    setOnboardingCompleted(false);
  };

  const markOnboardingCompleted = () => setOnboardingCompleted(true);

  const updateProfile = async (input: UpdateProfileInput) => {
    const updated = await updateProfileRequest(input);
    setUser(updated);
  };

  const refreshUser = async () => {
    const me = await fetchMe();
    setUser(me.user);
    setOnboardingCompleted(me.onboardingCompleted);
  };

  const signOutLocally = async () => {
    await clearTokens();
    setUser(null);
    setOnboardingCompleted(false);
  };

  const deleteAccount = async (input: DeleteAccountInput) => {
    await deleteAccountRequest(input);
    await signOutLocally();
  };

  const enableBiometricLock = async (): Promise<boolean> => {
    const success = await promptBiometricUnlock("Enable Face ID / Touch ID to unlock Fynrox");
    if (!success) return false;
    await setBiometricLockEnabled(true);
    setIsBiometricLockEnabledState(true);
    setIsUnlocked(true); // just proved identity — no need to immediately re-lock
    return true;
  };

  const disableBiometricLock = async () => {
    await setBiometricLockEnabled(false);
    setIsBiometricLockEnabledState(false);
    setIsUnlocked(true);
  };

  const unlock = async (): Promise<boolean> => {
    const success = await promptBiometricUnlock("Unlock Fynrox");
    if (success) setIsUnlocked(true);
    return success;
  };

  const setBiometricLockIdleTimeout = async (minutes: BiometricLockIdleTimeoutMinutes) => {
    await setBiometricLockIdleTimeoutMinutes(minutes);
    setBiometricLockIdleTimeoutState(minutes);
  };

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      onboardingCompleted,
      login,
      completeTwoFactorLogin,
      signup,
      logout,
      markOnboardingCompleted,
      updateProfile,
      refreshUser,
      signOutLocally,
      deleteAccount,
      isBiometricHardwareChecked,
      isBiometricHardwareReady: isBiometricHardwareReadyState,
      isBiometricLockEnabled,
      isUnlocked,
      enableBiometricLock,
      disableBiometricLock,
      unlock,
      biometricLockIdleTimeoutMinutes,
      setBiometricLockIdleTimeout,
    }),
    [
      user,
      isLoading,
      onboardingCompleted,
      isBiometricHardwareChecked,
      isBiometricHardwareReadyState,
      isBiometricLockEnabled,
      isUnlocked,
      biometricLockIdleTimeoutMinutes,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
