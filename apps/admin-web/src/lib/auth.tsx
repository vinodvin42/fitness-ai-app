import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import type { AdminUser } from "@fitness-ai-app/types";
import { apiClient, clearToken, getStoredToken, storeToken } from "./api";

interface AuthContextValue {
  adminUser: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Admin console auth state (Phase 6). Mirrors the shape of user-mobile's
 * AuthContext (bootstrap check on mount, login/logout actions) but simpler
 * — no refresh-token rotation, no onboarding flag; see apps/api's
 * adminAuth module for why.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    apiClient
      .get("/admin/auth/me")
      .then((res) => setAdminUser(res.data.adminUser))
      .catch(() => setAdminUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await apiClient.post("/admin/auth/login", { email, password });
    storeToken(res.data.token);
    setAdminUser(res.data.adminUser);
  }

  function logout() {
    clearToken();
    setAdminUser(null);
  }

  return (
    <AuthContext.Provider value={{ adminUser, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
