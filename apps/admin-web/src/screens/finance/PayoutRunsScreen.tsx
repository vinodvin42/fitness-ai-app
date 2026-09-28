import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { ReasonGatedAction } from "../../components/ReasonGatedAction";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { FINANCE_SUB_NAV } from "./subNav";

type RunKind = "professional_earning" | "creator_commission";

interface Preview {
  kind: RunKind;
  itemCount: number;
  totalCents: number;
  payeeCount: number;
}

interface PayoutBatch {
  id: string;
  kind: RunKind;
  status: string;
  itemCount: number;
  totalCents: number;
  reason: string;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
}

const money = (cents: number) => `₹${(cents / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const KIND_LABEL: Record<RunKind, string> = {
  professional_earning: "Professional earnings",
  creator_commission: "Creator commissions",
};

/**
 * A-M3 — "Payout run: approve professional earnings and creator
 * commissions, create payout batch, mark paid / failed". The handoff's
 * symptom was "rows say 'Await approval' with no action"; the backend
 * gained the action in the R1 pass, and this is the screen that uses it.
 *
 * DESIGN-PENDING A-M3.
 *
 * The impact preview above the confirm step is not decoration — it is
 * BR-ADM-005's "impact preview" requirement, and it is the difference
 * between an admin approving "the January run" and approving a specific
 * number of rupees to a specific number of people.
 *
 * Settlement honesty: D5 has no real payout provider, so completing a
 * run records that money SHOULD move, not that it did. That is stated on
 * the screen rather than left for someone to discover when a
 * professional says they were never paid.
 */
export function PayoutRunsScreen() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<RunKind>("professional_earning");
  const [settling, setSettling] = useState<string | null>(null);
  const [failedIdsText, setFailedIdsText] = useState("");

  const preview = useQuery({
    queryKey: ["payoutPreview", kind],
    queryFn: async () => (await apiClient.get<Preview>("/admin/payout-runs/preview", { params: { kind } })).data,
  });

  const runs = useQuery({
    queryKey: ["payoutRuns"],
    queryFn: async () => (await apiClient.get<PayoutBatch[]>("/admin/payout-runs")).data,
  });

  const providers = useQuery({
    queryKey: ["paymentsConfig"],
    queryFn: async () => (await apiClient.get<{ providers: { payout: { configured: boolean; name: string } } }>("/payments/config")).data,
  });

  const createRun = useMutation({
    mutationFn: (reason: string) =>
      apiClient.post("/admin/payout-runs", { kind, reason, confirmation: "RESOLVE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payoutRuns"] });
      queryClient.invalidateQueries({ queryKey: ["payoutPreview"] });
    },
  });

  const settle = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/admin/payout-runs/${id}/settle`, {
        reason,
        failedIds: failedIdsText
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        failureReason: failedIdsText.trim() ? "Rejected by the payout provider" : undefined,
      }),
    onSuccess: () => {
      setSettling(null);
      setFailedIdsText("");
      queryClient.invalidateQueries({ queryKey: ["payoutRuns"] });
    },
  });

  const p = preview.data;
  const payoutReal = providers.data?.providers?.payout?.configured ?? false;

  return (
    <AppShell title="Payout Runs" subNav={FINANCE_SUB_NAV}>
      {/* D5 is open. An admin completing a run needs to know whether they
          are moving money or recording an intention to. */}
      {!payoutReal ? (
        <p className="mb-5 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          No payout provider is configured (decision D5 is still open). Completing a run records what should be paid
          and marks the rows accordingly — it does not move money. Transfers still have to be made manually.
        </p>
      ) : null}

      <div className="mb-5 flex items-center gap-3">
        <label className="text-xs text-text-dim" htmlFor="payout-kind">
          Ledger
        </label>
        <select
          id="payout-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as RunKind)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          <option value="professional_earning">{KIND_LABEL.professional_earning}</option>
          <option value="creator_commission">{KIND_LABEL.creator_commission}</option>
        </select>
      </div>

      <section className="mb-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Next run — impact preview</h2>
        {preview.isLoading ? (
          <p className="mt-2 text-sm text-text-dim">Loading…</p>
        ) : preview.isError ? (
          <p className="mt-2 text-sm text-danger">{extractErrorMessage(preview.error, "Couldn't load the preview.")}</p>
        ) : (
          <>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-text-dim">Rows</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{p?.itemCount ?? 0}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-text-dim">Payees</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{p?.payeeCount ?? 0}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-text-dim">Total</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{money(p?.totalCents ?? 0)}</p>
              </div>
            </div>

            {p && p.itemCount > 0 ? (
              <div className="mt-5">
                {createRun.isError ? (
                  <p className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                    {extractErrorMessage(createRun.error, "Couldn't start the run.")}
                  </p>
                ) : null}
                <ReasonGatedAction
                  title={`Start ${KIND_LABEL[kind].toLowerCase()} run`}
                  description={`This will claim ${p.itemCount} approved row${
                    p.itemCount === 1 ? "" : "s"
                  } totalling ${money(p.totalCents)} across ${p.payeeCount} payee${
                    p.payeeCount === 1 ? "" : "s"
                  } into a new batch.`}
                  actionLabel="Start run"
                  isPending={createRun.isPending}
                  onConfirm={(reason) => createRun.mutate(reason)}
                  tone="warning"
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-text-dim">
                Nothing approved and unbatched. Approve eligible rows on the Settlements screen first.
              </p>
            )}
          </>
        )}
      </section>

      <h2 className="mb-3 text-sm font-semibold text-text-primary">Past runs</h2>
      {runs.isLoading ? (
        <p className="text-sm text-text-dim">Loading…</p>
      ) : (runs.data ?? []).length === 0 ? (
        <p className="text-sm text-text-dim">No runs yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-dim">
              <th className="py-2 pr-4">Started</th>
              <th className="py-2 pr-4">Ledger</th>
              <th className="py-2 pr-4">Rows</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {(runs.data ?? []).map((r) => (
              <tr key={r.id} className="border-b border-border/60 align-top">
                <td className="py-3 pr-4 text-text-secondary">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="py-3 pr-4 text-text-primary">{KIND_LABEL[r.kind]}</td>
                <td className="py-3 pr-4 text-text-primary">{r.itemCount}</td>
                <td className="py-3 pr-4 text-text-primary">{money(r.totalCents)}</td>
                <td className="py-3 pr-4">
                  <StatusBadge status={r.status} />
                  <p className="mt-1 max-w-xs text-[11px] text-text-dim">{r.reason}</p>
                </td>
                <td className="py-3 pr-4">
                  {r.status === "processing" ? (
                    settling === r.id ? (
                      <div className="max-w-sm">
                        <label className="block text-[11px] text-text-dim" htmlFor={`failed-${r.id}`}>
                          Row ids that failed (blank if all paid)
                        </label>
                        <textarea
                          id={`failed-${r.id}`}
                          rows={2}
                          value={failedIdsText}
                          onChange={(e) => setFailedIdsText(e.target.value)}
                          placeholder="Paste any ids the bank rejected"
                          className="mt-1 w-full rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text-primary"
                        />
                        {settle.isError ? (
                          <p className="mt-1 text-[11px] text-danger">
                            {extractErrorMessage(settle.error, "Couldn't settle the batch.")}
                          </p>
                        ) : null}
                        <div className="mt-2">
                          <ReasonGatedAction
                            title="Record the outcome"
                            description="Marks every row in this batch paid, except any id listed above."
                            actionLabel="Record outcome"
                            isPending={settle.isPending}
                            onConfirm={(reason) => settle.mutate({ id: r.id, reason })}
                            tone="warning"
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSettling(r.id)}
                        className="rounded-md border border-border px-3 py-1 text-xs text-text-secondary hover:text-text-primary"
                      >
                        Record outcome
                      </button>
                    )
                  ) : (
                    <span className="text-xs text-text-dim">
                      {r.processedAt ? new Date(r.processedAt).toLocaleDateString() : "—"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}
