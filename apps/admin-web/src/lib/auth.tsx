import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import type { AdminMfaSetupResponse, AdminUser } from "@fitness-ai-app/types";
import { apiClient, clearToken, getStoredToken, storeRole, storeToken } from "./api";

export type LoginResult = { kind: "signedIn" } | { kind: "mfaSetupRequired"; setupToken: string };

export interface MfaConfirmResult {
  token: string;
  adminUser: AdminUser;
  recoveryCodes: string[];
}

interface AuthContextValue {
  adminUser: AdminUser | null;
  isLoading: boolean;
  /** Email + password (+ the 6-digit authenticator code once MFA is set up). */
  login: (email: string, password: string, code?: string) => Promise<LoginResult>;
  startMfaSetup: (setupToken: string) => Promise<AdminMfaSetupResponse>;
  confirmMfaSetup: (setupToken: string, code: string) => Promise<MfaConfirmResult>;
  /** Starts the session returned by confirmMfaSetup, after the recovery codes were shown. */
  acceptSession: (token: string, adminUser: AdminUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Admin console auth state. Admins sign in with email + password + the code
 * from an authenticator app (FynroX blueprint section 5). An admin without
 * an authenticator is walked through setting one up on first sign-in.
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
      .then((res) => {
        setAdminUser(res.data.adminUser);
        storeRole(res.data.adminUser.role);
      })
      .catch(() => setAdminUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  function acceptSession(token: string, user: AdminUser) {
    storeToken(token);
    storeRole(user.role);
    setAdminUser(user);
  }

  async function login(email: string, password: string, code?: string): Promise<LoginResult> {
    const res = await apiClient.post("/admin/auth/login", { email, password, ...(code ? { code } : {}) });
    if (res.data.mfaSetupRequired) {
      return { kind: "mfaSetupRequired", setupToken: res.data.setupToken };
    }
    acceptSession(res.data.token, res.data.adminUser);
    return { kind: "signedIn" };
  }

  async function startMfaSetup(setupToken: string): Promise<AdminMfaSetupResponse> {
    const res = await apiClient.post<AdminMfaSetupResponse>("/admin/auth/mfa/setup", { setupToken });
    return res.data;
  }

  async function confirmMfaSetup(setupToken: string, code: string): Promise<MfaConfirmResult> {
    const res = await apiClient.post("/admin/auth/mfa/confirm", { setupToken, code });
    return { token: res.data.token, adminUser: res.data.adminUser, recoveryCodes: res.data.recoveryCodes };
  }

  function logout() {
    clearToken();
    setAdminUser(null);
  }

  return (
    <AuthContext.Provider value={{ adminUser, isLoading, login, startMfaSetup, confirmMfaSetup, acceptSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
