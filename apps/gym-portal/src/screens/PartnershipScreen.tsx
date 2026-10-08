import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppShell } from "../components/AppShell";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface Partnership {
  status: string;
  partnerSince: string;
  locationCount: number;
  memberCount: number;
  commercialConfigured: boolean;
  pricingModel: string;
}

/**
 * Partnership status — and G-M2's end states ("Rejected (final),
 * suspended, partnership ended ... extend 'access unavailable' with a
 * reason line").
 *
 * DESIGN-PENDING. The commercial terms themselves are deliberately not
 * shown: they are negotiated admin-to-partner figures, and the existing
 * /gym-portal/me route already trims them for the same reason. What a
 * partner needs here is whether terms exist and who to ask.
 */
const STATUS_COPY: Record<string, string> = {
  application: "We're reviewing your application. We'll email your contact as soon as there's a decision.",
  approved: "Your partnership is active. Your invite link and QR are live.",
  more_info:
    "We need a bit more information before we can approve your partnership. Your account manager has emailed you the details.",
  rejected:
    "We weren't able to approve this application. Your account manager can explain the reasons and whether reapplying makes sense.",
  suspended:
    "Your partnership is currently suspended, so your invite link won't work for new members. Existing members keep their accounts.",
  ended:
    "This partnership has ended. Your invite link no longer works. Members who joined through it keep their own accounts and data.",
};

export function PartnershipScreen() {
  const { t } = useTranslation();
  const partnership = useQuery({
    queryKey: ["gymPartnership"],
    queryFn: async () => (await apiClient.get<Partnership>("/gym-portal/partnership")).data,
  });

  if (partnership.isLoading) {
    return (
      <AppShell title={t("nav.partnership")}>
        <p className="text-sm text-text-dim">Loading…</p>
      </AppShell>
    );
  }
  if (partnership.isError || !partnership.data) {
    return (
      <AppShell title={t("nav.partnership")}>
        <p className="text-sm text-danger">
          {extractErrorMessage(partnership.error, "Couldn't load your partnership details.")}
        </p>
      </AppShell>
    );
  }

  const p = partnership.data;

  return (
    <AppShell title={t("nav.partnership")}>
      <section className="max-w-2xl rounded-lg border border-border-subtle bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Status</h2>
          <StatusBadge status={p.status} />
        </div>
        {/* G-M2: every end state gets a reason line a human wrote, not a
            bare badge. "Access unavailable" with no explanation is what
            generates the support call this page exists to prevent. */}
        <p className="mt-2 text-sm text-text-secondary">
          {STATUS_COPY[p.status] ?? "Contact your account manager for details on your partnership status."}
        </p>
        <p className="mt-3 text-xs text-text-dim">
          Partner since {new Date(p.partnerSince).toLocaleDateString()}
        </p>
      </section>

      <section className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border-subtle bg-surface p-4">
          <p className="text-xs uppercase tracking-widest text-text-dim">Locations</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{p.locationCount}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface p-4">
          <p className="text-xs uppercase tracking-widest text-text-dim">{t("partnership.membersJoined")}</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{p.memberCount}</p>
          {/* G-M5's empty state, in the place a gym actually looks. */}
          {p.memberCount === 0 ? (
            <p className="mt-1 text-[11px] text-text-dim">
              {t("partnership.noneYet")}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-text-dim">{t("partnership.aggregateOnly")}</p>
          )}
        </div>
      </section>

      <section className="mt-6 max-w-2xl rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">{t("partnership.commercialTerms")}</h2>
        <p className="mt-2 text-sm text-text-secondary">
          {p.commercialConfigured
            ? "Your commercial terms are agreed and on file. Your Fynrox account manager has the details."
            : "Your commercial terms haven't been set up yet. Your Fynrox account manager will be in touch."}
        </p>
      </section>
    </AppShell>
  );
}
