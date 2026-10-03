import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppShell } from "../components/AppShell";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import { r1Flags } from "@fitness-ai-app/config";

interface ReferralTools {
  status: string;
  commissionPct: number;
}

/**
 * Agreement & commercial terms, plus C-M3's suspended / partnership-
 * ended states. DESIGN-PENDING.
 *
 * The legal text itself is a placeholder and says so: D13 ("Final legal
 * text ... Placeholders; block production release") is still open, and
 * presenting draft commercial terms as agreed ones to someone who earns
 * money from them would be worse than an honest placeholder.
 */
const STATUS_COPY: Record<string, string> = {
  active: "Your creator partnership is active and your links are live.",
  inactive: "Your partnership is paused. Existing links won't attribute new signups.",
  draft: "Your application hasn't been submitted yet.",
  pending_review: "We're reviewing your application. We'll email you as soon as there's a decision.",
  more_info: "We need a bit more information before we can approve your partnership — check your email.",
  rejected: "We weren't able to approve this application. Your Fynrox contact can explain why.",
  suspended:
    "Your partnership is suspended, so your links won't attribute new signups. Commission already earned is unaffected.",
  ended:
    "This partnership has ended and your links no longer work. Any commission already earned will still be paid out.",
};

export function AgreementScreen() {
  const { t } = useTranslation();
  const tools = useQuery({
    queryKey: ["creatorReferralTools"],
    queryFn: async () => (await apiClient.get<ReferralTools>("/influencer-portal/referral-tools")).data,
  });

  const status = tools.data?.status ?? "active";

  return (
    <AppShell title={t("agreement.title")}>
      <section className="max-w-2xl rounded-lg border border-border-subtle bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">{t("agreement.status")}</h2>
          <StatusBadge status={status} />
        </div>
        {/* C-M3 — every end state gets a sentence, not a bare badge. */}
        <p className="mt-2 text-sm text-text-secondary">{STATUS_COPY[status] ?? STATUS_COPY.active}</p>
      </section>

      <section className="mt-6 max-w-2xl rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">{t("agreement.commercialTerms")}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">{t("agreement.commissionRate")}</dt>
            <dd className="text-text-primary">{tools.data ? `${tools.data.commissionPct}%` : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">{t("agreement.appliesTo")}</dt>
            <dd className="text-text-primary">{t("agreement.appliesToValue")}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">{t("agreement.payoutSchedule")}</dt>
            <dd className="text-text-primary">{t("agreement.payoutScheduleValue")}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Refunds</dt>
            <dd className="text-text-primary">{t("agreement.refundNote")}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 max-w-2xl rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">{t("agreement.creatorAgreement")}</h2>
        {!r1Flags.LEGAL_TEXT_APPROVED ? (
          // D13 is open. Saying so is better than showing draft terms to
          // someone who earns money under them.
          <p className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
            {t("agreement.draftNote")}
          </p>
        ) : (
          <p className="mt-2 text-sm text-text-secondary">
            {t("agreement.signedNote")}
          </p>
        )}
      </section>
    </AppShell>
  );
}
