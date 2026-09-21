import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import type { InfluencerAuthResponse, PublicInfluencer } from "@fitness-ai-app/types";
import { apiClient, clearTokens, getStoredAccessToken, getStoredRefreshToken, storeTokens } from "./api";

interface AuthContextValue {
  influencer: PublicInfluencer | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Creator Portal auth state (R2 Wave 5, 21 Sep 2026) — same shape as
 * apps/admin-web's AuthProvider (bootstrap check on mount, login/logout
 * actions), keyed to the separate `Influencer` identity's own token pair
 * instead of AdminUser's single token. On mount: try `GET
 * /influencer-portal/me` with a stored access token; if that 401s (expired
 * access token, real refresh token still valid), use `POST
 * /influencers/auth/refresh` once and retry — the one place this portal's
 * simplified api.ts (no interceptor-level silent refresh, see its own
 * comment) still spends the refresh token.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [influencer, setInfluencer] = useState<PublicInfluencer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      const accessToken = getStoredAccessToken();
      const refreshToken = getStoredRefreshToken();
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await apiClient.get("/influencer-portal/me");
        setInfluencer(res.data.influencer);
      } catch {
        if (!refreshToken) {
          clearTokens();
          setIsLoading(false);
          return;
        }
        try {
          const refreshRes = await apiClient.post<InfluencerAuthResponse>("/influencers/auth/refresh", {
            refreshToken,
          });
          storeTokens(refreshRes.data.tokens.accessToken, refreshRes.data.tokens.refreshToken);
          const res = await apiClient.get("/influencer-portal/me");
          setInfluencer(res.data.influencer);
        } catch {
          clearTokens();
          setInfluencer(null);
        }
      } finally {
        setIsLoading(false);
      }
    }

    void bootstrap();
  }, []);

  async function login(email: string, password: string) {
    const res = await apiClient.post<InfluencerAuthResponse>("/influencers/auth/login", { email, password });
    storeTokens(res.data.tokens.accessToken, res.data.tokens.refreshToken);
    setInfluencer(res.data.influencer);
  }

  function logout() {
    clearTokens();
    setInfluencer(null);
  }

  return (
    <AuthContext.Provider value={{ influencer, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
