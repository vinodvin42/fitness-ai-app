import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import type { GymPortalIdentity } from "@fitness-ai-app/types";
import { apiClient, clearToken, getStoredToken, storeToken } from "./api";

interface AuthContextValue {
  gym: GymPortalIdentity | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Gym Partner Lite portal auth state (R2 Wave 5, 21 Sep 2026) — copies
 * apps/admin-web/src/lib/auth.tsx's AuthProvider/useAuth pattern verbatim
 * (bootstrap check on mount against GET /gym-portal/auth/me, login/logout
 * actions, no refresh-token rotation), keyed to the separate `Gym` identity
 * instead of `AdminUser`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [gym, setGym] = useState<GymPortalIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    apiClient
      .get("/gym-portal/auth/me")
      .then((res) => setGym(res.data.gym))
      .catch(() => setGym(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await apiClient.post("/gym-portal/auth/login", { email, password });
    storeToken(res.data.token);
    setGym(res.data.gym);
  }

  function logout() {
    clearToken();
    setGym(null);
  }

  return <AuthContext.Provider value={{ gym, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
