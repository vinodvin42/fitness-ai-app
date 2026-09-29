import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { extractErrorMessage } from "../lib/apiError";

/**
 * Real login screen (R2 Wave 5, 21 Sep 2026) — copies apps/admin-web's
 * LoginScreen.tsx pattern exactly. No self-signup: an influencer's portal
 * password is admin-granted (see apps/api's adminInfluencers.service.ts
 * `setInfluencerPortalPassword`), so there's nothing to sign up for here —
 * same "plain functional auth, undesigned but real" precedent every other
 * app's first login screen in this codebase follows.
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
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-canvas">
            PF
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">FYNROX</div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim">{t("shell.portalName")}</div>
          </div>
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
            {isSubmitting ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-text-dim">
          {t("login.noAccess")}
        </p>
      </div>
    </div>
  );
}
