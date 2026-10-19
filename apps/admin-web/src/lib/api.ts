import axios, { AxiosError } from "axios";
import { apiBaseUrl } from "./env";
import { MIN_REASON_LENGTH, requestReason, showApprovalNotice } from "./reasonPrompt";

const TOKEN_KEY = "fynrox-admin.token";
const ROLE_KEY = "fynrox-admin.role";

export const apiClient = axios.create({ baseURL: apiBaseUrl });

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function storeRole(role: string): void {
  localStorage.setItem(ROLE_KEY, role);
}

function storedRole(): string | null {
  return localStorage.getItem(ROLE_KEY);
}

/**
 * Maker-checker (D21). Every admin except the Super Admin needs Lakshman's
 * approval for risky changes, and everyone (Lakshman included) must say
 * why. Any write without a reason asks for one in an in-app dialog
 * (lib/reasonPrompt.ts, components/ReasonDialogHost.tsx — Oct 2026, replacing
 * window.prompt) and sends it as the X-Change-Reason header. Cancelling the
 * dialog cancels the request. Forms that already send `reason` are left alone.
 */
const WRITE_METHODS = new Set(["post", "put", "patch", "delete"]);
const NO_REASON_PATHS = [/^\/admin\/auth\//, /^\/admin\/approvals/];

apiClient.interceptors.request.use(async (config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const method = (config.method ?? "get").toLowerCase();
  const url = config.url ?? "";
  const role = storedRole();
  const body = (config.data ?? {}) as Record<string, unknown>;
  const hasReason =
    !!config.headers["X-Change-Reason"] ||
    (typeof body === "object" && body !== null && typeof body.reason === "string" && body.reason.trim().length >= MIN_REASON_LENGTH);
  if (token && role && WRITE_METHODS.has(method) && !hasReason && !NO_REASON_PATHS.some((re) => re.test(url))) {
    const question =
      role === "super_admin"
        ? "Why are you making this change? It is saved to the audit log."
        : "This change needs Lakshman's approval. Why are you making it?";
    const reason = await requestReason(question);
    if (reason === null || reason.length < MIN_REASON_LENGTH) {
      return Promise.reject(new AxiosError(`A reason of at least ${MIN_REASON_LENGTH} characters is needed for this change.`, "ERR_CANCELED", config));
    }
    // URL-encoded: HTTP headers can't carry ₹, Hindi/Telugu text or emoji as-is.
    config.headers["X-Change-Reason"] = encodeURIComponent(reason);
  }
  return config;
});

// There's no admin refresh-token flow (see apps/api's config/env.ts,
// ADMIN_JWT_ACCESS_TTL_MIN's doc comment) — a 401 here just means the
// session token is missing/expired, so the only correct move is to clear
// it and let AuthProvider's state drop back to "logged out", which routes
// to /login. This is deliberately simpler than user-mobile's client.ts
// (no silent refresh-and-retry), matching this slice's "plain functional
// auth" scope.
apiClient.interceptors.response.use(
  (response) => {
    // A 202 "pending_approval" means nothing was changed yet. Screens expect
    // the changed record back, so surface it as a clear message instead.
    const data = response.data as { status?: string; message?: string } | undefined;
    if (response.status === 202 && data?.status === "pending_approval") {
      const message = data.message ?? "Sent to Lakshman for approval. Nothing changes until he approves it.";
      showApprovalNotice(message);
      const err = new AxiosError(message, "PENDING_APPROVAL", response.config, response.request, {
        ...response,
        data: { error: { code: "pending_approval", message }, approvalRequest: (response.data as { approvalRequest?: unknown }).approvalRequest },
      });
      return Promise.reject(err);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
    }
    return Promise.reject(error);
  },
);
