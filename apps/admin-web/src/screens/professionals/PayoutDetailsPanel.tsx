import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminPayoutAccountResponse,
  AdminPayoutAccountRevealResponse,
  AdminVerifyPayoutAccountInput,
} from "@fitness-ai-app/types";
import { StatusBadge } from "../../components/StatusBadge";
import { ReasonGatedAction } from "../../components/ReasonGatedAction";
import { useCan } from "../../lib/permissions";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";

/** Revealed details clear themselves after this long. */
const REVEAL_VISIBLE_MS = 2 * 60 * 1000;

/**
 * Coach payout details (27 Oct 2026) on the professional's profile. The coach
 * enters a bank account or UPI ID in the coach app; it's stored encrypted and
 * shown here masked. Verify / Reject is gated like a payout run (`commerce:
 * approve`, maker-checker for anyone but the Super Admin; the API client asks
 * for the reason). Full details need a written reason and are audited
 * (ReasonGatedAction, POST .../payout-account/reveal); they're kept only in
 * this component's memory and hidden again after two minutes.
 */
export function PayoutDetailsPanel({ professionalId }: { professionalId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canDecide = useCan("commerce", "approve");
  const [notes, setNotes] = useState("");
  const [noteError, setNoteError] = useState(false);
  const [revealed, setRevealed] = useState<AdminPayoutAccountRevealResponse | null>(null);
  const queryKey = ["admin-professional-payout-account", professionalId];

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<AdminPayoutAccountResponse>(`/admin/professionals/${professionalId}/payout-account`).then((r) => r.data),
  });
  const account = data?.account ?? null;

  const decide = useMutation({
    mutationFn: (input: AdminVerifyPayoutAccountInput) =>
      apiClient.post(`/admin/professionals/${professionalId}/payout-account/verify`, input),
    onSuccess: () => {
      setNotes("");
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const reveal = useMutation({
    mutationFn: (reason: string) =>
      apiClient
        .post<AdminPayoutAccountRevealResponse>(`/admin/professionals/${professionalId}/payout-account/reveal`, { reason })
        .then((r) => r.data),
    onSuccess: (details) => setRevealed(details),
  });

  // Hide revealed details again after a while, and whenever the details change.
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), REVEAL_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [revealed]);
  useEffect(() => setRevealed(null), [account?.updatedAt]);

  function submit(status: "verified" | "rejected") {
    if (!account) return;
    const trimmed = notes.trim();
    if (status === "rejected" && trimmed.length < 3) {
      setNoteError(true);
      return;
    }
    setNoteError(false);
    decide.mutate({ status, adminNotes: trimmed || undefined, updatedAt: account.updatedAt });
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4 lg:col-span-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-text-dim">{t("professionalPayoutDetails.title")}</div>
        {account && <StatusBadge status={account.status} />}
      </div>
      <p className="mt-1 text-xs text-text-secondary">{t("professionalPayoutDetails.intro")}</p>

      {isLoading && <p className="mt-3 text-sm text-text-secondary">{t("professionalPayoutDetails.loading")}</p>}
      {isError && <p className="mt-3 text-xs text-danger">{extractErrorMessage(error, t("professionalPayoutDetails.loadError"))}</p>}
      {data && !account && <p className="mt-3 text-sm text-text-dim">{t("professionalPayoutDetails.none")}</p>}

      {account && (
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <dl className="space-y-2 text-sm">
            <Row
              label={t("professionalPayoutDetails.method")}
              value={account.method === "bank" ? t("professionalPayoutDetails.methodBank") : t("professionalPayoutDetails.methodUpi")}
            />
            <Row label={t("professionalPayoutDetails.holder")} value={account.accountHolderName} />
            <Row
              label={account.method === "bank" ? t("professionalPayoutDetails.accountNumber") : t("professionalPayoutDetails.upiId")}
              value={account.maskedDisplay}
              mono
            />
            {account.method === "bank" && <Row label={t("professionalPayoutDetails.ifsc")} value={account.ifsc ?? "—"} mono />}
            <Row label={t("professionalPayoutDetails.updated")} value={new Date(account.updatedAt).toLocaleString()} />
            {account.verifiedAt && (
              <Row label={t("professionalPayoutDetails.verifiedAt")} value={new Date(account.verifiedAt).toLocaleString()} />
            )}
            {account.adminNotes && <Row label={t("professionalPayoutDetails.notes")} value={account.adminNotes} />}
          </dl>

          <div className="space-y-3">
            {!canDecide && <p className="text-xs text-text-dim">{t("professionalPayoutDetails.noPermission")}</p>}

            {canDecide && (
              <div className="space-y-2">
                <textarea
                  aria-label={t("professionalPayoutDetails.notes")}
                  placeholder={t("professionalPayoutDetails.notesPlaceholder")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                />
                {noteError && <p className="text-xs text-danger">{t("professionalPayoutDetails.rejectNeedsNote")}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={decide.isPending || account.status === "verified"}
                    onClick={() => submit("verified")}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                  >
                    {t("professionalPayoutDetails.verify")}
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending || account.status === "rejected"}
                    onClick={() => submit("rejected")}
                    className="rounded-md border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger disabled:opacity-40"
                  >
                    {t("professionalPayoutDetails.reject")}
                  </button>
                </div>
                {decide.isError && (
                  <p className="text-xs text-danger">{extractErrorMessage(decide.error, "That didn't go through. Try again.")}</p>
                )}
                {decide.isSuccess && !decide.isPending && <p className="text-xs text-accent">{t("professionalPayoutDetails.decided")}</p>}
              </div>
            )}

            {canDecide && data && !data.revealAvailable && (
              <p className="text-xs text-warning">{t("professionalPayoutDetails.keyMissing")}</p>
            )}

            {canDecide && data?.revealAvailable && !revealed && (
              <ReasonGatedAction
                title={t("professionalPayoutDetails.revealTitle")}
                description={t("professionalPayoutDetails.revealDescription")}
                actionLabel={t("professionalPayoutDetails.revealAction")}
                tone="warning"
                isPending={reveal.isPending}
                isError={reveal.isError}
                error={reveal.error}
                onConfirm={(reason) => reveal.mutate(reason)}
              />
            )}

            {revealed && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-warning">{t("professionalPayoutDetails.revealed")}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setRevealed(null);
                      reveal.reset();
                    }}
                    className="text-xs text-text-secondary underline hover:text-text-primary"
                  >
                    {t("professionalPayoutDetails.hide")}
                  </button>
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  <Row label={t("professionalPayoutDetails.holder")} value={revealed.accountHolderName} />
                  {revealed.accountNumber && <Row label={t("professionalPayoutDetails.accountNumber")} value={revealed.accountNumber} mono />}
                  {revealed.ifsc && <Row label={t("professionalPayoutDetails.ifsc")} value={revealed.ifsc} mono />}
                  {revealed.upiId && <Row label={t("professionalPayoutDetails.upiId")} value={revealed.upiId} mono />}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-dim">{label}</dt>
      <dd className={`text-right text-text-secondary ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}
