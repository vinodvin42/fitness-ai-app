import { AppShell } from "../components/AppShell";

/**
 * Gym Partner Lite portal — "Support/contact" (R2 Wave 5, 21 Sep 2026).
 *
 * A real, honest static contact screen rather than a thin wrapper around
 * `support.service.ts#createTicket` — that function's `SupportTicket` model
 * is keyed to a `User.userId` (a consumer account), not a `Gym`, and its
 * `category` enum has no gym-partner-appropriate value. Extending
 * `SupportTicket` to accept a second, optional `gymId` actor (mirroring how
 * `AuditLog` already carries three parallel optional actor columns —
 * `actorId`/`actorAdminId`/`actorProfessionalId`) is a real, reasonable
 * follow-up, but it's a schema + service + admin-web triage-queue change
 * that reaches well outside this wave's scope (a new gym-portal app). See
 * docs/admin/07-open-questions-gaps.md's dated entry for this wave for the
 * explicit flag. A plain mailto/contact-info screen is the honest, genuinely
 * useful "Support/contact" this wave can ship.
 */
export function SupportScreen() {
  return (
    <AppShell title="Support">
      <div className="max-w-lg space-y-4">
        <div className="rounded-lg border border-border-subtle bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-primary">Contact FynroX Partner Support</h2>
          <p className="mt-2 text-sm text-text-secondary">
            For anything about your partner account — commercial terms, adding or updating a location, resetting
            your portal password, or a question about your invite code — reach out directly and a real person will
            follow up.
          </p>

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-text-dim">Email</dt>
              <dd>
                <a href="mailto:partners@fynrox.com" className="text-accent hover:underline">
                  partners@fynrox.com
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-text-dim">Response time</dt>
              <dd className="text-text-secondary">Typically within 1–2 business days.</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-5 text-xs text-text-dim">
          FynroX never shares your members' nutrition logs, medical or safety information, progress photos, or
          private AI Coach conversations with your gym — support requests about a specific member's health data will
          always be declined, by policy, no matter how they're submitted.
        </div>
      </div>
    </AppShell>
  );
}
