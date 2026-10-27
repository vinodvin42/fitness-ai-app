import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import axios from "axios";
import type { AdminMfaSetupResponse } from "@fitness-ai-app/types";
import { useAuth, type MfaConfirmResult } from "../lib/auth";
import { extractErrorMessage } from "../lib/apiError";
import { BrandLockup } from "../components/BrandLockup";
import { ThemeMenu } from "../components/ThemeMenu";

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
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const second = step.kind === "code" ? (useRecoveryCode ? { recoveryCode: code } : { code }) : undefined;
      const result = await login(email, password, second);
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
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="absolute top-4 right-4">
        <ThemeMenu />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-border-subtle bg-surface p-8 shadow-sm">
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
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${INPUT_CLASS} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  aria-pressed={showPassword}
                  aria-controls="password"
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-text-dim hover:text-text-primary focus-visible:text-accent focus-visible:outline-none"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPassword && <path d="M3 3l18 18" />}
                  </svg>
                </button>
              </div>
            </div>

            {step.kind === "credentials" && (
              <div className="-mt-2 text-right">
                <Link to="/forgot-password" className="text-xs text-text-secondary hover:text-accent">
                  Forgot password?
                </Link>
              </div>
            )}

            {step.kind === "code" && (
              <div>
                <label className="mb-1 block text-xs text-text-secondary" htmlFor="code">
                  {useRecoveryCode ? "Recovery code" : "6-digit code from your authenticator app"}
                </label>
                {useRecoveryCode ? (
                  <input
                    id="code"
                    autoComplete="off"
                    required
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className={`${INPUT_CLASS} font-mono tracking-widest`}
                  />
                ) : (
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
                )}
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryCode((v) => !v);
                    setCode("");
                  }}
                  className="mt-2 text-xs text-accent hover:underline"
                >
                  {useRecoveryCode ? "Use my authenticator app instead" : "Lost your phone? Use a recovery code"}
                </button>
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
