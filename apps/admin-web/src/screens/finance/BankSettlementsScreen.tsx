import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminBankSettlementsResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

// Razorpay's settlement states (GET /v1/settlements); anything else is shown as Razorpay sends it.
const STATUS: Record<string, { label: string; className: string }> = {
  created: { label: "On its way", className: "bg-warning/15 text-warning" },
  // Same colours StatusBadge uses for these states (the admin theme has no "success" colour).
  processed: { label: "Paid to bank", className: "bg-accent/15 text-accent" },
  failed: { label: "Failed", className: "bg-danger/15 text-danger" },
};

const INPUT_CLASS =
  "rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent";

const plural = (n: number) => `${n} ${n === 1 ? "settlement" : "settlements"}`;

function CopyUtr({ utr }: { utr: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(utr).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      aria-label={`Copy UTR ${utr}`}
      className="ml-2 text-[11px] text-accent hover:underline"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * 10.09 Bank Settlements (docs/admin/03-screen-inventory.md §10.09), Oct
 * 2026 — what Razorpay has paid into the business's bank account, read live
 * from Razorpay (GET /admin/finance/bank-settlements; see
 * adminFinance.service.ts). Read-only: match each settlement to the bank
 * statement by its UTR. The Figma's connected-bank cards and balances need a
 * bank-feed vendor that hasn't been chosen, so they're listed as not
 * available. Test payments show nothing (no money moves); without Razorpay
 * keys the screen says so.
 */
export function BankSettlementsScreen() {
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [range, setRange] = useState<{ from?: string; to?: string }>({});

  const query = useQuery({
    queryKey: ["admin-bank-settlements", range.from, range.to],
    queryFn: () =>
      apiClient.get<AdminBankSettlementsResponse>("/admin/finance/bank-settlements", { params: { from: range.from, to: range.to } }).then((r) => r.data),
  });
  const data = query.data;
  const money = (cents: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: data?.currency ?? "INR" }).format(cents / 100);

  return (
    <AppShell title="Bank Settlements" subNav={FINANCE_SUB_NAV}>
      <div className="space-y-4">
        <div className="rounded-lg border border-border-subtle bg-surface/50 p-4 text-xs text-text-secondary">
          What Razorpay has paid into your bank account, read live from Razorpay. Match each settlement to your bank statement by its
          UTR (Unique Transaction Reference). Nothing on this screen changes anything.
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setRange({ from: fromInput || undefined, to: toInput || undefined });
          }}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4"
        >
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            From
            <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            To
            <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} className={INPUT_CLASS} />
          </label>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas">
            Show
          </button>
          {data && (
            <span className="text-xs text-text-dim">
              Showing {data.range.from} to {data.range.to} (India time){range.from || range.to ? "" : ", the last 30 days"}.
            </span>
          )}
        </form>

        {query.isLoading && <p className="text-sm text-text-secondary">Loading from Razorpay…</p>}
        {query.isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(query.error, "Couldn't load settlements.")}
            <button type="button" onClick={() => query.refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && data.source === "mock" && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-text-secondary">
            Payments are in test mode on this server, so no money moves and there are no settlements to show.
          </div>
        )}
        {data && data.source === "razorpay" && !data.connected && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-text-secondary">
            Razorpay isn't connected on this server (its key ID and secret aren't set), so settlements can't be read yet.
          </div>
        )}

        {data && data.source === "razorpay" && data.connected && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Paid to bank" value={money(data.totals.processedCents)} hint={plural(data.totals.processedCount)} />
              <StatCard label="On its way" value={money(data.totals.pendingCents)} hint={plural(data.totals.pendingCount)} />
              <StatCard label="Failed" value={data.totals.failedCount} hint={data.totals.failedCount > 0 ? money(data.totals.failedCents) : undefined} />
              <StatCard label="Fees + tax" value={money(data.totals.feesCents + data.totals.taxCents)} hint="Charged on these settlements" />
            </div>

            {data.totals.failedCount > 0 && (
              <p className="text-xs text-danger">
                A failed settlement usually means the bank account is inactive, its details are wrong, or the bank rejected it. Check
                the Razorpay Dashboard for what to do next.
              </p>
            )}
            {data.truncated && (
              <p className="text-xs text-warning">Razorpay returned its maximum of 100 settlements; older ones in this range aren't shown. Narrow the dates.</p>
            )}

            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              {data.settlements.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-text-dim">No settlements in this period.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Date</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Amount</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Fees</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Tax</th>
                      <th scope="col" className="px-4 py-2 font-medium">UTR</th>
                      <th scope="col" className="px-4 py-2 font-medium">Status</th>
                      <th scope="col" className="px-4 py-2 font-medium">Razorpay ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.settlements.map((s) => {
                      const st = STATUS[s.status] ?? { label: s.status, className: "bg-surface-raised text-text-secondary" };
                      return (
                        <tr key={s.id} className="border-b border-border-subtle last:border-0">
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-text-secondary">{new Date(s.createdAt).toLocaleString()}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-text-primary">{money(s.amountCents)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-text-secondary">{money(s.feesCents)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-text-secondary">{money(s.taxCents)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-text-primary">
                            {s.utr ?? "—"}
                            {s.utr && <CopyUtr utr={s.utr} />}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.className}`}>{st.label}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-text-dim">{s.id}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {data && <NotAvailablePanel keys={data.notAvailable} subtitle="The Figma also shows connected bank accounts with live balances. That needs a bank-feed provider (an RBI Account Aggregator or a bank API), which hasn't been chosen." />}
      </div>
    </AppShell>
  );
}
