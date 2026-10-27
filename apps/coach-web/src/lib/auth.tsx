import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Professional, ProfessionalLoginInput, ProfessionalSignupInput } from "@fitness-ai-app/types";
import { clearTokens, getStoredTokens, setSessionLostHandler, storeTokens } from "@/api/client";
import { fetchMe, loginRequest, logoutRequest, signupRequest } from "@/api/professionalAuth";
import { queryClient } from "@/lib/queryClient";

/**
 * Signed-in coach, same contract as apps/coach-mobile's AuthContext:
 * `onboardingCompleted` decides between onboarding and the app. A session
 * that can't be refreshed (expired, or the coach was suspended) signs out
 * and wipes the query cache, so the next person on the device sees nothing.
 */
type AuthValue = {
  professional: Professional | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  onboardingCompleted: boolean;
  login: (input: ProfessionalLoginInput) => Promise<void>;
  signup: (input: ProfessionalSignupInput) => Promise<void>;
  logout: () => Promise<void>;
  markOnboardingCompleted: () => void;
  refreshProfessional: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const reset = useCallback(() => {
    clearTokens();
    queryClient.clear();
    setProfessional(null);
    setOnboardingCompleted(false);
  }, []);

  useEffect(() => {
    setSessionLostHandler(reset);
    (async () => {
      if (!getStoredTokens().accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        setProfessional(me.professional);
        setOnboardingCompleted(me.onboardingCompleted);
      } catch {
        reset();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [reset]);

  const login = useCallback(async (input: ProfessionalLoginInput) => {
    const res = await loginRequest(input);
    storeTokens(res.tokens.accessToken, res.tokens.refreshToken);
    setProfessional(res.professional);
    setOnboardingCompleted(res.onboardingCompleted);
  }, []);

  const signup = useCallback(async (input: ProfessionalSignupInput) => {
    const res = await signupRequest(input);
    storeTokens(res.tokens.accessToken, res.tokens.refreshToken);
    setProfessional(res.professional);
    setOnboardingCompleted(res.onboardingCompleted);
  }, []);

  const logout = useCallback(async () => {
    const { refreshToken } = getStoredTokens();
    if (refreshToken) await logoutRequest(refreshToken).catch(() => undefined);
    reset();
  }, [reset]);

  const refreshProfessional = useCallback(async () => {
    const me = await fetchMe();
    setProfessional(me.professional);
    setOnboardingCompleted(me.onboardingCompleted);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      professional,
      isLoading,
      isAuthenticated: !!professional,
      onboardingCompleted,
      login,
      signup,
      logout,
      markOnboardingCompleted: () => setOnboardingCompleted(true),
      refreshProfessional,
    }),
    [professional, isLoading, onboardingCompleted, login, signup, logout, refreshProfessional],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
