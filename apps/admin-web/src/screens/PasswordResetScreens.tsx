import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";
import { BrandLockup } from "../components/BrandLockup";

const INPUT_CLASS =
  "w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-accent";
const BUTTON_CLASS =
  "w-full rounded-md bg-accent py-2 text-sm font-medium text-canvas transition-opacity disabled:opacity-60";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-xl border border-border-subtle bg-surface p-8">
        <div className="mb-6 flex items-center">
          <BrandLockup subtitle="Admin console" />
        </div>
        <h1 className="mb-4 text-base font-semibold text-text-primary">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/**
 * Admin "Forgot password" (Oct 2026): ask for a reset link by email
 * (POST /admin/auth/forgot-password). The reply is the same whether or not
 * the email belongs to an admin, so nobody can probe for accounts.
 */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiClient.post<{ message: string }>("/admin/auth/forgot-password", { email: email.trim() });
      setSent(res.data.message);
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't send the request. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Forgot your password?">
      {sent ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-text-secondary">{sent}</p>
          <Link to="/login" className="block text-center text-xs text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-xs text-text-secondary">
            Enter your admin email. If it belongs to an admin account, we'll email a link to set a new password. You'll still need
            your sign-in code afterwards.
          </p>
          <div>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="reset-email">
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={busy} className={BUTTON_CLASS}>
            {busy ? "Sending…" : "Email me a reset link"}
          </button>
          <Link to="/login" className="block text-center text-xs text-text-secondary hover:text-text-primary">
            Back to sign in
          </Link>
        </form>
      )}
    </Card>
  );
}

/**
 * The emailed link lands here (…/reset-password?token=…): set a new password
 * (POST /admin/auth/reset-password). The link works once, for 30 minutes.
 * The console is also served under /app, so App.tsx routes both paths here.
 */
export function ResetPasswordScreen() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8 || password !== confirm) return;
    setError(null);
    setBusy(true);
    try {
      await apiClient.post("/admin/auth/reset-password", { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(extractErrorMessage(err, "Couldn't reset the password. The link may have expired; ask for a new one."));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Card title="Reset link missing">
        <p className="text-sm text-text-secondary">This page needs the link from the reset email.</p>
        <Link to="/forgot-password" className="mt-4 block text-center text-xs text-accent hover:underline">
          Ask for a new link
        </Link>
      </Card>
    );
  }

  return (
    <Card title={done ? "Password changed" : "Set a new password"}>
      {done ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-text-secondary">
            Your password has been changed. Sign in with it and your sign-in code.
          </p>
          <Link to="/login" className="block text-center text-xs text-accent hover:underline">
            Go to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="new-password">
              New password (at least 8 characters)
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={tooShort}
              className={INPUT_CLASS}
            />
            {tooShort && <p className="mt-1 text-[11px] text-danger">At least 8 characters.</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary" htmlFor="confirm-password">
              Type it again
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
              className={INPUT_CLASS}
            />
            {mismatch && <p className="mt-1 text-[11px] text-danger">The two passwords don't match.</p>}
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={busy || password.length < 8 || password !== confirm} className={BUTTON_CLASS}>
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}
    </Card>
  );
}
