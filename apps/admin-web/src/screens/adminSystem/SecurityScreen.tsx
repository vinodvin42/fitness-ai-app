import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AdminSecurityOverview } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { useAuth } from "../../lib/auth";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

const MIN_PASSWORD_LENGTH = 8;

interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const EMPTY_FORM: ChangePasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

/**
 * 12.05 Security (docs/admin/03-screen-inventory.md §12.05, "a
 * security-events table, and a security-config card — 2FA, password
 * policy, session settings"). This ships the one piece of that card with
 * a real backend behind it: changing your own password
 * (`PATCH /admin/auth/password`, added in the same 25 Aug 2026 hardening
 * pass that made this screen necessary — see adminAuth.routes.ts's own
 * doc comment for why). Password policy and session settings are honestly
 * NOT built, and the security-events table isn't either (no security-event
 * log distinct from the general AuditLog exists); they render via
 * `NotAvailablePanel` instead of being silently absent.
 *
 * Oct 2026: the sign-in code (admin MFA, D21) now exists — an
 * authenticator-app code at every sign-in, set up at the first one, with
 * recovery codes. This screen shows the admin's own status and how a lost
 * phone is handled (a Super Admin resets it on Admin Users).
 *
 * No admin-web screen linked here before this — the endpoint existed but
 * had no UI, meaning the seeded bootstrap credential (published in this
 * repo's own RUN-LOCALLY.md) had no way to actually get rotated by
 * someone without direct database access. This closes that gap for real.
 */
const SECURITY_EVENT_LABELS: Record<string, string> = {
  "admin_user.login": "Signed in",
  "admin_user.password_changed": "Password changed",
  "admin_user.mfa_enabled": "Sign-in code set up",
  "admin_user.mfa_recovery_code_used": "Recovery code used",
  "admin_user.mfa_reset": "Sign-in code reset",
  "admin_user.disable": "Account disabled",
  "admin_user.enable": "Account enabled",
  "admin.password_reset_requested": "Password reset requested",
  "admin.password_reset_completed": "Password reset by email link",
};

export function SecurityScreen() {
  const { t } = useTranslation();
  const { adminUser } = useAuth();
  const security = useQuery({
    queryKey: ["admin-security"],
    queryFn: () => apiClient.get<AdminSecurityOverview>("/admin/auth/security").then((r) => r.data),
  });
  const [form, setForm] = useState<ChangePasswordForm>(EMPTY_FORM);
  const [justChanged, setJustChanged] = useState(false);

  const changePasswordMutation = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiClient.patch("/admin/auth/password", input),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setJustChanged(true);
    },
  });

  const confirmMismatch =
    form.confirmPassword.length > 0 && form.newPassword !== form.confirmPassword;
  const tooShort = form.newPassword.length > 0 && form.newPassword.length < MIN_PASSWORD_LENGTH;
  const canSubmit =
    form.currentPassword.length > 0 &&
    form.newPassword.length >= MIN_PASSWORD_LENGTH &&
    form.newPassword === form.confirmPassword;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setJustChanged(false);
    if (!canSubmit) return;
    changePasswordMutation.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword });
  }

  return (
    <AppShell title={t("security.security")} subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        <form
          onSubmit={handleSubmit}
          className="max-w-md space-y-3 rounded-xl border border-border-subtle bg-surface shadow-xs p-4"
        >
          <div className="text-sm font-medium">{t("security.changePassword")}</div>
          <p className="text-xs text-text-secondary">
            Changing your password does not sign you out of this session, but you'll need the new one next
            time you log in — there's no "sign out other sessions" here, admin sessions have no session list to
            revoke (see apps/api's adminAuth module).
          </p>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("security.currentPassword")}
            <input
              required
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("security.newPassword")}
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={form.newPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            {tooShort && <span className="text-danger">At least {MIN_PASSWORD_LENGTH} characters.</span>}
          </label>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            {t("security.confirmNewPassword")}
            <input
              required
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            {confirmMismatch && <span className="text-danger">{t("security.doesnTMatch")}</span>}
          </label>

          {changePasswordMutation.isError && (
            <p className="text-xs text-danger">
              {extractErrorMessage(changePasswordMutation.error, "Couldn't change your password.")}
            </p>
          )}

          {justChanged && !changePasswordMutation.isError && (
            <p className="text-xs text-accent">{t("security.passwordChanged")}</p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || changePasswordMutation.isPending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
          >
            {changePasswordMutation.isPending ? "Changing…" : "Change password"}
          </button>
        </form>

        <div className="max-w-xl space-y-2 rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Sign-in code (MFA)</div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${adminUser?.mfaEnabled ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"}`}
            >
              {adminUser?.mfaEnabled ? "Set up" : "Not set up"}
            </span>
          </div>
          <p className="text-xs text-text-secondary">
            Every admin signs in with their password plus a 6-digit code from an authenticator app. The app is set up at the first
            sign-in, which also gives you one-time recovery codes.
          </p>
          <p className="text-xs text-text-dim">
            Lost your phone? Sign in with one of your recovery codes, or ask the Super Admin to reset your sign-in code on Admin
            Users. You then set up a new authenticator at your next sign-in.
          </p>
        </div>

        {security.data && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4 text-sm">
                <div className="text-xs uppercase tracking-wide text-text-dim">Password policy</div>
                <p className="mt-2 text-text-secondary">
                  {security.data.passwordPolicy.minLength} to {security.data.passwordPolicy.maxLength} characters.
                </p>
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4 text-sm">
                <div className="text-xs uppercase tracking-wide text-text-dim">Session settings</div>
                <p className="mt-2 text-text-secondary">
                  You stay signed in for {Math.round(security.data.session.lengthMinutes / 60)} hours, then sign in again.{" "}
                  {security.data.session.mfaRequired ? "A sign-in code is required at every sign-in." : "Sign-in codes are off on this server."}{" "}
                  At most {security.data.session.signInAttempts.limit} sign-in attempts per {security.data.session.signInAttempts.windowMinutes} minutes
                  from one network.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface shadow-xs">
              <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">Your security events</div>
              <ul className="divide-y divide-border-subtle text-sm">
                {security.data.events.map((e) => (
                  <li key={e.id} className="flex justify-between px-4 py-2">
                    <span className="text-text-secondary">
                      {SECURITY_EVENT_LABELS[e.action] ?? e.action}
                      {!e.byYou && <span className="ml-2 text-xs text-text-dim">by another admin</span>}
                    </span>
                    <span className="text-text-dim">{new Date(e.createdAt).toLocaleString()}</span>
                  </li>
                ))}
                {security.data.events.length === 0 && <li className="px-4 py-4 text-center text-text-dim">No security events yet.</li>}
              </ul>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
