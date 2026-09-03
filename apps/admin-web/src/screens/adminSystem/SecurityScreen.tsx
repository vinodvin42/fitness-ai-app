import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppShell } from "../../components/AppShell";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
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
 * doc comment for why). 2FA, password policy, and session settings are
 * honestly NOT built — none of that exists anywhere in this API — and the
 * security-events table isn't either (no security-event log distinct from
 * the general AuditLog exists); both render via `NotAvailablePanel`
 * instead of being silently absent, same convention as every other
 * "half-real" module in this build.
 *
 * No admin-web screen linked here before this — the endpoint existed but
 * had no UI, meaning the seeded bootstrap credential (published in this
 * repo's own RUN-LOCALLY.md) had no way to actually get rotated by
 * someone without direct database access. This closes that gap for real.
 */
export function SecurityScreen() {
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
    <AppShell title="Security" subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        <form
          onSubmit={handleSubmit}
          className="max-w-md space-y-3 rounded-lg border border-border-subtle bg-surface p-4"
        >
          <div className="text-sm font-medium">Change password</div>
          <p className="text-xs text-text-secondary">
            Changing your password does not sign you out of this session, but you'll need the new one next
            time you log in — there's no "sign out other sessions" here, admin sessions have no session list to
            revoke (see apps/api's adminAuth module).
          </p>

          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Current password
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
            New password
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
            Confirm new password
            <input
              required
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            />
            {confirmMismatch && <span className="text-danger">Doesn't match.</span>}
          </label>

          {changePasswordMutation.isError && (
            <p className="text-xs text-danger">
              {extractErrorMessage(changePasswordMutation.error, "Couldn't change your password.")}
            </p>
          )}

          {justChanged && !changePasswordMutation.isError && (
            <p className="text-xs text-accent">Password changed.</p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || changePasswordMutation.isPending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
          >
            {changePasswordMutation.isPending ? "Changing…" : "Change password"}
          </button>
        </form>

        <NotAvailablePanel
          keys={["twoFactorAuth", "passwordPolicy", "sessionSettings", "securityEventsTable"]}
          subtitle="The rest of 12.05's spec'd security-config card and events table — none of this exists anywhere in this API yet."
        />
      </div>
    </AppShell>
  );
}
