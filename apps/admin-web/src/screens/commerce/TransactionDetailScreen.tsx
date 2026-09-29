import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import type { AdminPaymentDetailResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { COMMERCE_SUB_NAV } from "./subNav";

const PURPOSE_LABELS: Record<string, string> = { subscription: "Subscription", program_purchase: "Program purchase" };

const ACTION_LABELS: Record<string, string> = {
  "payment.order_created": "Order created",
  "payment.captured": "Payment captured",
};

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function fetchDetail(id: string): Promise<AdminPaymentDetailResponse> {
  const res = await apiClient.get<AdminPaymentDetailResponse>(`/admin/payments/${id}`);
  return res.data;
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-text-dim">{label}</dt>
      <dd className="text-text-secondary">{value}</dd>
    </div>
  );
}

/**
 * 06.02 Transaction detail (docs/admin/03-screen-inventory.md §06.02) — "a
 * detail screen, not a list" per the Figma spec, added 22 Aug 2026. Reached
 * only via a row-click from 06.03 Payments (`/commerce/:id`), same
 * Directory→Detail drill-down shape as Relationships/Users/Professionals.
 * See apps/api's adminPayments.service.ts for the full real-vs-not
 * breakdown: the "ledger flow card" renders the one real line item this
 * build tracks (the gross amount charged, no fee/discount/tax breakdown),
 * the "related-entities card" is the paying User plus the actual Plan/
 * Program purchased (deliberately not an inferred downstream Subscription/
 * ProgramPurchase row — see the service file for why), and the "audit
 * trail/timeline" reads real `AuditLog` rows for this Payment, which can
 * be genuinely incomplete for a `failed` payment.
 */
export function TransactionDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-payment-detail", id],
    queryFn: () => fetchDetail(id as string),
    enabled: !!id,
  });

  const payment = data?.payment;

  return (
    <AppShell title={t("transactionDetail.transactionDetail")} subNav={COMMERCE_SUB_NAV}>
      {isLoading && <p className="text-sm text-text-secondary">{t("transactionDetail.loading")}</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load this transaction.")}
          <button type="button" onClick={() => refetch()} className="ml-3 underline">
            {t("transactionDetail.retry")}
          </button>
        </div>
      )}

      {data && payment && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("transactionDetail.transaction")}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-sm text-text-primary">{payment.id}</span>
                <StatusBadge status={payment.status} />
              </div>
              <p className="mt-1 text-xs text-text-dim">
                Read-only — every status change here comes from the Razorpay gateway or its webhook, never from an
                admin action. See this screen's own doc comment.
              </p>
            </div>
            <Link to="/commerce" className="text-xs text-text-secondary hover:text-text-primary">
              {t("transactionDetail.backToPayments")}
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("transactionDetail.ledger")}</div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Field label={t("transactionDetail.purpose")} value={PURPOSE_LABELS[payment.purpose] ?? payment.purpose} />
                <Field label={t("transactionDetail.amount")} value={`${money(payment.amountCents)} ${payment.currency}`} />
                <Field label={t("transactionDetail.provider")} value={payment.provider} />
                <Field label={t("transactionDetail.created")} value={new Date(payment.createdAt).toLocaleString()} />
                <Field label={t("transactionDetail.providerOrderId")} value={payment.providerOrderId} />
                <Field label={t("transactionDetail.providerPaymentId")} value={payment.providerPaymentId ?? "—"} />
              </dl>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("transactionDetail.relatedEntities")}</div>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-text-dim">{t("transactionDetail.user")}</dt>
                  <dd className="text-text-secondary">
                    {payment.userFullName} <span className="text-xs text-text-dim">({payment.userEmail})</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-dim">{t("transactionDetail.purchased")}</dt>
                  {data.reference ? (
                    <dd className="text-text-secondary">
                      {data.reference.name}
                      {data.reference.type === "plan" && (
                        <span className="text-xs text-text-dim">
                          {" "}
                          · {data.reference.tier} · {data.reference.billingCycle}
                        </span>
                      )}
                      <span className="text-xs text-text-dim"> · {money(data.reference.priceCents)} list price</span>
                    </dd>
                  ) : (
                    <dd className="text-text-dim">
                      Original {PURPOSE_LABELS[payment.purpose] ?? payment.purpose} row no longer exists (id{" "}
                      {payment.referenceId})
                    </dd>
                  )}
                </div>
              </dl>
            </div>
          </div>

          <NotAvailablePanel
            keys={data.notAvailable}
            subtitle={t("transactionDetail.noBackingDataExists")}
          />

          <div className="rounded-lg border border-border-subtle bg-surface">
            <div className="border-b border-border-subtle px-4 py-3 text-xs uppercase tracking-wide text-text-dim">
              {t("transactionDetail.auditTrail")}
            </div>
            <ul className="divide-y divide-border-subtle">
              {data.auditTrail.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="text-sm text-text-primary">{ACTION_LABELS[a.action] ?? a.action}</div>
                  <div className="text-xs text-text-dim">{new Date(a.createdAt).toLocaleString()}</div>
                </li>
              ))}
              {data.auditTrail.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-text-dim">{t("transactionDetail.noAuditEntriesRecorded")}</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </AppShell>
  );
}
