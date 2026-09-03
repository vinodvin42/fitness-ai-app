import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Professional, ProfessionalLoginInput, ProfessionalSignupInput } from "@fitness-ai-app/types";
import { clearTokens, getStoredTokens, storeTokens } from "../api/client";
import { fetchMe, loginRequest, logoutRequest, signupRequest } from "../api/professionalAuth";

/**
 * Mirrors apps/user-mobile/src/context/AuthContext.tsx's core shape
 * (user/isLoading/isAuthenticated/onboardingCompleted/login/signup/logout),
 * deliberately WITHOUT that file's biometric-lock complexity (§L Security)
 * — not designed anywhere in docs/coach's reviewed Figma file, and out of
 * scope for this first slice (see docs/coach/07-open-questions-gaps.md's
 * "Phase 5 started" entry). `markOnboardingCompleted` isn't needed here
 * either: unlike the consumer app's 5-step wizard (one `markOnboardingCompleted`
 * call at the very end), this app's `onboardingCompleted` is recomputed
 * from the server after every step that can change it (selecting a
 * service) via `refreshOnboardingStatus`, since "onboarding completed"
 * here just means "has selected >= 1 service" — see
 * professionalOnboarding.service.ts's hasSelectedServices.
 */
interface AuthContextValue {
  professional: Professional | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Drives RootNavigator's Auth -> Onboarding -> MainTabs switch. */
  onboardingCompleted: boolean;
  login: (input: ProfessionalLoginInput) => Promise<void>;
  signup: (input: ProfessionalSignupInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Call after Service Selection succeeds — flips onboardingCompleted to true immediately rather than waiting on a refetch. */
  markOnboardingCompleted: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // On launch: if a token is already stored, resolve the current
  // professional (and onboarding status) so a returning coach skips
  // straight past the Auth stack — and, if onboarding is still incomplete,
  // past the wizard steps they already finished too.
  useEffect(() => {
    (async () => {
      const { accessToken } = await getStoredTokens();
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        setProfessional(me.professional);
        setOnboardingCompleted(me.onboardingCompleted);
      } catch {
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (input: ProfessionalLoginInput) => {
    const { professional: loggedIn, tokens, onboardingCompleted: completed } = await loginRequest(input);
    await storeTokens(tokens.accessToken, tokens.refreshToken);
    setProfessional(loggedIn);
    setOnboardingCompleted(completed);
  };

  const signup = async (input: ProfessionalSignupInput) => {
    const { professional: newProfessional, tokens, onboardingCompleted: completed } = await signupRequest(input);
    await storeTokens(tokens.accessToken, tokens.refreshToken);
    setProfessional(newProfessional);
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
    setProfessional(null);
    setOnboardingCompleted(false);
  };

  const markOnboardingCompleted = () => setOnboardingCompleted(true);

  const value = useMemo(
    () => ({
      professional,
      isLoading,
      isAuthenticated: !!professional,
      onboardingCompleted,
      login,
      signup,
      logout,
      markOnboardingCompleted,
    }),
    [professional, isLoading, onboardingCompleted],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
