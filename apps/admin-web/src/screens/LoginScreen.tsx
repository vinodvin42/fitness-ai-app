import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import type { AdminMfaSetupResponse } from "@fitness-ai-app/types";
import { useAuth, type MfaConfirmResult } from "../lib/auth";
import { extractErrorMessage } from "../lib/apiError";
import { BrandLockup } from "../components/BrandLockup";

type Step =
  | { kind: "credentials" }
  | { kind: "code" }
  | { kind: "setup"; setupToken: string; setup: AdminMfaSetupResponse }
  | { kind: "recoveryCodes"; result: MfaConfirmResult };

const INPUT_CLASS =
  "w-full rounded-md border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-accent";
const BUTTON_CLASS =
  "w-full rounded-md bg-accent py-2 text-sm font-medium text-canvas transition-opacity disabled:opacity-60";

function errorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { error?: { code?: string } } | undefined)?.error?.code;
  }
  return undefined;
}

/**
 * Admin sign-in: email + password + the 6-digit code from an authenticator
 * app (FynroX blueprint section 5 — no OTP). An admin who has not set up an
 * authenticator yet scans a QR code on first sign-in, confirms one code,
 * and is shown ten single-use recovery codes once.
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const { login, startMfaSetup, confirmMfaSetup, acceptSession } = useAuth();
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await login(email, password, step.kind === "code" ? code : undefined);
      if (result.kind === "mfaSetupRequired") {
        const setup = await startMfaSetup(result.setupToken);
        setCode("");
        setStep({ kind: "setup", setupToken: result.setupToken, setup });
      }
    } catch (err) {
      if (errorCode(err) === "mfa_required") {
        setStep({ kind: "code" });
      } else {
        setError(extractErrorMessage(err, "Couldn't sign in. Check your email and password."));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onConfirmSetup(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== "setup") return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await confirmMfaSetup(step.setupToken, code);
      setStep({ kind: "recoveryCodes", result });
    } catch (err) {
      setError(extractErrorMessage(err, "That code is not right. Try the newest code in your app."));
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

        {(step.kind === "credentials" || step.kind === "code") && (
          <form onSubmit={onSignIn} className="space-y-4">
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
                className={INPUT_CLASS}
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
                className={INPUT_CLASS}
              />
            </div>

            {step.kind === "code" && (
              <div>
                <label className="mb-1 block text-xs text-text-secondary" htmlFor="code">
                  6-digit code from your authenticator app
                </label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className={`${INPUT_CLASS} tracking-[0.3em]`}
                />
              </div>
            )}

            {error && <p className="text-xs text-danger">{error}</p>}

            <button type="submit" disabled={isSubmitting} className={BUTTON_CLASS}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {step.kind === "setup" && (
          <form onSubmit={onConfirmSetup} className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Set up your authenticator app</p>
              <p className="mt-1 text-xs text-text-secondary">
                Admin sign-in needs a code from an authenticator app (Google Authenticator, Microsoft Authenticator or
                1Password). Scan this code with the app, then enter the 6-digit code it shows.
              </p>
            </div>
            <img src={step.setup.qrCodeDataUrl} alt="QR code for your authenticator app" className="mx-auto h-44 w-44 rounded-md bg-white p-2" />
            <p className="break-all text-center font-mono text-[11px] text-text-secondary">Or enter this key: {step.setup.secret}</p>
            <input
              aria-label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${INPUT_CLASS} tracking-[0.3em]`}
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <button type="submit" disabled={isSubmitting || code.length !== 6} className={BUTTON_CLASS}>
              {isSubmitting ? "Checking…" : "Turn on and sign in"}
            </button>
          </form>
        )}

        {step.kind === "recoveryCodes" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Save your recovery codes</p>
              <p className="mt-1 text-xs text-text-secondary">
                If you lose your phone, each code below signs you in once. They are shown only now. Keep them somewhere safe.
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-2 rounded-md border border-border-subtle bg-surface-raised p-3 font-mono text-sm text-text-primary">
              {step.result.recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => acceptSession(step.result.token, step.result.adminUser)}
              className={BUTTON_CLASS}
            >
              I've saved them — continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
