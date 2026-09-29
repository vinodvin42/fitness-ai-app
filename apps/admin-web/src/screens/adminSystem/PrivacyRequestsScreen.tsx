import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { ReasonGatedAction } from "../../components/ReasonGatedAction";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

interface PrivacyRequest {
  id: string;
  type: "export" | "deletion";
  status: string;
  userNote: string | null;
  scheduledFor: string | null;
  rejectionReason: string | null;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; fullName: string; email: string };
}

/**
 * A-M5 — "Privacy request detail: verify identity, fulfil export,
 * schedule deletion, confirm". The handoff's note was "Queue rows lead
 * nowhere"; before R1 there was no queue at all, only an audit-log
 * reconstruction of things that had already happened.
 *
 * DESIGN-PENDING A-M5.
 *
 * The verify step is deliberately its own action with its own reason
 * field rather than folded into "start". Fulfilling an unverified
 * deletion request IS the data breach the process exists to prevent, so
 * the person who checked the identity and the person who pressed delete
 * leave separate marks in the audit trail.
 */
const STATUS_HELP: Record<string, string> = {
  received: "Nobody has checked this person's identity yet.",
  verifying: "Identity verified. Start fulfilment when you're ready.",
  in_progress: "Being fulfilled. Deletions run after the scheduled date.",
  completed: "Done.",
  rejected: "Refused or cancelled.",
};

export function PrivacyRequestsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("received");
  const [exportUrl, setExportUrl] = useState<Record<string, string>>({});

  const requests = useQuery({
    queryKey: ["privacyRequests", status],
    queryFn: async () =>
      (await apiClient.get<PrivacyRequest[]>("/admin/privacy-requests", { params: { status } })).data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["privacyRequests"] });

  const step = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: "verify" | "start"; reason: string }) =>
      apiClient.post(`/admin/privacy-requests/${id}/${action}`, { reason }),
    onSuccess: invalidate,
  });

  const resolve = useMutation({
    mutationFn: ({ id, action, reason, url }: { id: string; action: "complete" | "reject"; reason: string; url?: string }) =>
      apiClient.post(`/admin/privacy-requests/${id}/${action}`, {
        reason,
        confirmation: "RESOLVE",
        ...(url ? { exportUrl: url } : {}),
      }),
    onSuccess: invalidate,
  });

  const rows = requests.data ?? [];

  return (
    <AppShell title={t("privacyRequests.privacyRequests")} subNav={ADMIN_SYSTEM_SUB_NAV}>
      <p className="mb-5 max-w-3xl text-sm text-text-secondary">
        Data-subject requests under the DPDP Act. Verify who someone is before you act on their request —
        fulfilling an unverified deletion is itself the breach.
      </p>

      <div className="mb-5 flex items-center gap-3">
        <label className="text-xs text-text-dim" htmlFor="privacy-status">
          {t("privacyRequests.status")}
        </label>
        <select
          id="privacy-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        >
          {["received", "verifying", "in_progress", "completed", "rejected"].map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-dim">{STATUS_HELP[status]}</span>
      </div>

      {(step.isError || resolve.isError) ? (
        <p className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {extractErrorMessage(step.error ?? resolve.error, "Couldn't update the request.")}
        </p>
      ) : null}

      {requests.isLoading ? (
        <p className="text-sm text-text-dim">{t("privacyRequests.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-dim">{t("privacyRequests.nothingInThisState")}</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <article key={r.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">
                    {r.type === "deletion" ? "Account deletion" : "Data export"} — {r.user.fullName}
                  </h2>
                  <p className="text-xs text-text-dim">
                    {r.user.email} · raised {new Date(r.createdAt).toLocaleString()}
                  </p>
                  {r.userNote ? (
                    <p className="mt-2 max-w-xl text-sm text-text-secondary">“{r.userNote}”</p>
                  ) : null}
                  {r.scheduledFor ? (
                    <p className="mt-2 text-xs text-warning">
                      Deletion scheduled for {new Date(r.scheduledFor).toLocaleDateString()} — the user can still
                      cancel until then.
                    </p>
                  ) : null}
                  {r.rejectionReason ? (
                    <p className="mt-2 text-xs text-text-dim">Closed: {r.rejectionReason}</p>
                  ) : null}
                </div>
                <StatusBadge status={r.status} />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {r.status === "received" ? (
                  <ReasonGatedAction
                    title={t("privacyRequests.verifyIdentity")}
                    description={t("privacyRequests.recordHowYouConfirmed")}
                    actionLabel={t("privacyRequests.markVerified")}
                    isPending={step.isPending}
                    onConfirm={(reason) => step.mutate({ id: r.id, action: "verify", reason })}
                    tone="warning"
                  />
                ) : null}

                {r.status === "verifying" ? (
                  <ReasonGatedAction
                    title={t("privacyRequests.startFulfilment")}
                    description={
                      r.type === "deletion"
                        ? "Schedules the deletion 30 days out. The user can cancel during that window."
                        : "Moves the request into fulfilment so an export can be prepared."
                    }
                    actionLabel={t("privacyRequests.start")}
                    isPending={step.isPending}
                    onConfirm={(reason) => step.mutate({ id: r.id, action: "start", reason })}
                    tone="warning"
                  />
                ) : null}

                {r.status === "in_progress" ? (
                  <>
                    {r.type === "export" ? (
                      <div>
                        <label className="block text-xs text-text-dim" htmlFor={`url-${r.id}`}>
                          {t("privacyRequests.exportDownloadLink")}
                        </label>
                        <input
                          id={`url-${r.id}`}
                          value={exportUrl[r.id] ?? ""}
                          onChange={(e) => setExportUrl((s) => ({ ...s, [r.id]: e.target.value }))}
                          placeholder="https://…"
                          className="mt-1 w-full rounded-md border border-border bg-canvas px-2 py-1 text-sm text-text-primary"
                        />
                        <p className="mt-1 text-[11px] text-text-dim">{t("privacyRequests.expires72HoursAfter")}</p>
                      </div>
                    ) : null}
                    <ReasonGatedAction
                      title={r.type === "deletion" ? "Complete deletion" : "Complete export"}
                      description={
                        r.type === "deletion"
                          ? "Irreversible. Removes this person's data; the audit trail survives with an anonymized actor."
                          : "Marks the export ready and sends the link to the user."
                      }
                      actionLabel={t("privacyRequests.complete")}
                      isPending={resolve.isPending}
                      onConfirm={(reason) =>
                        resolve.mutate({ id: r.id, action: "complete", reason, url: exportUrl[r.id] })
                      }
                      tone="danger"
                    />
                  </>
                ) : null}

                {r.status !== "completed" && r.status !== "rejected" ? (
                  <ReasonGatedAction
                    title={t("privacyRequests.refuseThisRequest")}
                    description={t("privacyRequests.giveAReasonThe")}
                    actionLabel={t("privacyRequests.refuse")}
                    isPending={resolve.isPending}
                    onConfirm={(reason) => resolve.mutate({ id: r.id, action: "reject", reason })}
                    tone="danger"
                  />
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
