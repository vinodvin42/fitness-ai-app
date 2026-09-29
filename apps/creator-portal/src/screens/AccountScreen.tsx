import { AppShell } from "../components/AppShell";
import { useAuth } from "../lib/auth";
import { BRAND_SUPPORT_EMAIL } from "@fitness-ai-app/config";

/**
 * Account & support. DESIGN-PENDING.
 *
 * Payout details are collected by a human rather than a form, and that
 * is stated rather than hidden behind a disabled input: D5 (payout
 * provider) is still open, so there is nothing to validate bank details
 * against and storing them would mean holding payment credentials this
 * product cannot yet use safely.
 */
export function AccountScreen() {
  const { influencer } = useAuth();

  return (
    <AppShell title="Account">
      <section className="max-w-2xl rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Your details</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Name</dt>
            <dd className="text-text-primary">{influencer?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Handle</dt>
            <dd className="text-text-primary">{influencer?.handle ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Email</dt>
            <dd className="text-text-primary">{influencer?.email ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-text-dim">
          To change any of these, email {BRAND_SUPPORT_EMAIL} from the address on file.
        </p>
      </section>

      <section className="mt-6 max-w-2xl rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Payout details</h2>
        <p className="mt-2 text-sm text-text-secondary">
          We collect bank or UPI details directly with your FynroX contact rather than through this portal, so they
          never sit in a form. If a payout fails, that's the first thing to check.
        </p>
      </section>

      <section className="mt-6 max-w-2xl rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Support</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Questions about commission, campaigns or your agreement:{" "}
          {/* Underlined, not colour-only: axe-core (29 Sep 2026) measured
              the accent against the surrounding body text at 1.53:1, where
              WCAG wants 3:1 for a link inside a text block. Someone who
              cannot separate mint from grey would not see a link here at
              all. */}
          <a className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent" href={`mailto:${BRAND_SUPPORT_EMAIL}`}>
            {BRAND_SUPPORT_EMAIL}
          </a>
        </p>
        <p className="mt-3 text-xs text-text-dim">
          We can't answer questions about individual members — who they are, what they train, or anything they log.
          That applies to everyone, including partners.
        </p>
      </section>
    </AppShell>
  );
}
