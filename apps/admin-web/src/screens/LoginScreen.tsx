import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { extractErrorMessage } from "../lib/apiError";
import { BrandLockup } from "../components/BrandLockup";

/**
 * Plain functional auth (gap §1 in docs/admin/07-open-questions-gaps.md:
 * "the file starts at the authenticated Dashboard, no login screen was
 * designed — decide who designs one"). Resolved here the same way the
 * mobile app's original phone+OTP-vs-email+password gap was resolved:
 * build a real, working, undesigned screen now rather than block on a
 * design pass that hasn't happened. No "forgot password" — there's no
 * reset flow yet (see adminAuth.schema.ts's doc comment).
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't sign in. Check your email and password."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-xl border border-border-subtle bg-surface p-8">
        <div className="mb-6 flex items-center">
          <BrandLockup subtitle={t("login.superAdminConsole")} />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="email">
              {t("login.email")}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="password">
              {t("login.password")}
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-accent py-2 text-sm font-medium text-canvas transition-opacity disabled:opacity-60"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
