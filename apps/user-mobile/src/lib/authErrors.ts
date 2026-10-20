/**
 * Sign-in and sign-up error text (Oct 2026). Both screens used to show one fixed message for every
 * failure ("Incorrect email or password." / "…that email may already be taken."), so when the
 * server was unreachable (the 20 Oct 2026 Azure outage) every member was told their email was
 * taken. This maps the real reason. Pure (no axios import) so tests/authErrors.check.cjs can run it.
 */
type ApiErrorBody = { error?: { code?: string; message?: string; details?: { fieldErrors?: Record<string, string[] | undefined> } } };
type AxiosLike = { isAxiosError?: boolean; code?: string; response?: { status?: number; data?: unknown } };

const FIELD_LABELS: Record<string, string> = { email: "Email", password: "Password", fullName: "Name", referralCode: "Referral code" };

export function authErrorMessage(err: unknown, kind: "login" | "signup"): string {
  const e = (err ?? {}) as AxiosLike;
  if (!e.isAxiosError) return "Something went wrong. Please try again.";
  const status = e.response?.status;
  if (!e.response || e.code === "ECONNABORTED" || e.code === "ERR_NETWORK") {
    return "Can't reach Fynrox right now. Check your connection and try again.";
  }
  const body = (typeof e.response.data === "object" && e.response.data !== null ? e.response.data : {}) as ApiErrorBody;
  const code = body.error?.code;
  if (status === 429) return "Too many attempts. Wait a few minutes and try again.";
  // A 5xx, or a page that isn't our API's JSON (a hosting error page), means the service is down.
  if (!status || status >= 500 || !code) return "Fynrox is having trouble right now. Please try again in a few minutes.";
  if (kind === "signup" && code === "email_taken") return "An account with this email already exists. Log in instead.";
  if (kind === "login" && code === "invalid_credentials") return "Incorrect email or password.";
  if (code === "validation_error") {
    const fields = body.error?.details?.fieldErrors ?? {};
    const first = Object.entries(fields).find(([, msgs]) => Array.isArray(msgs) && msgs.length > 0);
    if (first) return `${FIELD_LABELS[first[0]] ?? first[0]}: ${first[1]![0]}`;
  }
  return body.error?.message ?? "Something went wrong. Please try again.";
}
