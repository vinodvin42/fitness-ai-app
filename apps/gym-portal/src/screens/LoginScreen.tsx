import { FormEvent, useState } from "react";
import { useAuth } from "../lib/auth";
import { extractErrorMessage } from "../lib/apiError";

/**
 * Copies apps/admin-web's LoginScreen.tsx shape (plain functional auth, no
 * "forgot password" — there's no self-serve reset flow, an admin re-runs
 * `POST /admin/gyms/:id/portal-password` instead, see gyms.service.ts's own
 * doc comment) against the separate gym-portal login endpoint.
 */
export function LoginScreen() {
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
            <div className="text-[10px] uppercase tracking-widest text-text-dim">Gym Partner Portal</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="email">
              Contact email
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
              Password
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

          <p className="text-center text-[11px] text-text-dim">
            No portal access yet, or forgot your password? Contact FynroX support — your account manager can set or
            reset it.
          </p>
        </form>
      </div>
    </div>
  );
}
