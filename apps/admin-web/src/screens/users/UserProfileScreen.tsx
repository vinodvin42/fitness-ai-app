import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { AdminUserDetailResponse, MembershipTier, SensitiveAccessRequestResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";

const MEMBERSHIP_LABELS: Record<MembershipTier, string> = { free: "Free", basic: "Basic", pro: "Pro", elite: "Elite" };
const SERVICE_LABELS: Record<string, string> = { fitness: "Fitness", nutrition: "Nutrition" };
const PAYMENT_PURPOSE_LABELS: Record<string, string> = { subscription: "Subscription", program_purchase: "Program purchase" };

type Tab = "overview" | "activity" | "subscription" | "payments" | "relationships" | "support";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "subscription", label: "Subscription" },
  { key: "payments", label: "Payments" },
  { key: "relationships", label: "Relationships" },
  { key: "support", label: "Support History" },
];

async function fetchDetail(id: string): Promise<AdminUserDetailResponse> {
  const res = await apiClient.get<AdminUserDetailResponse>(`/admin/users/${id}`);
  return res.data;
}

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-dim">{label}</dt>
      <dd className="text-right text-text-secondary">{value}</dd>
    </div>
  );
}

/**
 * 02.02 User Profile (docs/admin/03-screen-inventory.md §02) — added 21 Aug
 * 2026. Overview/Subscription/Payments/Relationships/Support History are
 * real, backed by the existing Subscription/Payment/Relationship/
 * SupportTicket/AuditLog models scoped to this one user. Activity renders
 * `NotAvailablePanel` — the spec gives no key-data detail for it beyond
 * the tab name, and it would either duplicate Overview's real event feed
 * or need a genuinely new fitness-activity-stats feature this slice
 * doesn't have room for.
 *
 * **25 Aug 2026:** the "Sensitive Health Metrics" panel is real, not just
 * a locked placeholder any more — see apps/api's adminUsers.service.ts
 * for the full design (a supervisor-approved, logged per-user access
 * request, gated by the `sensitiveData` permission module). This screen
 * renders one of four states off `data.sensitiveAccess`/
 * `data.sensitiveHealthMetrics`: no permission at all (still locked, no
 * button — most roles); no request yet or last one denied (a reason field
 * + Request Access button); pending (a plain status line, no action);
 * approved (the real `OnboardingProfile` fields). A viewing admin who can
 * approve (`canReview`) additionally sees a small review card for the
 * single most recent OTHER admin's pending request, with real Approve/
 * Deny actions — reusing this same screen rather than a separate queue
 * screen, since the Figma's 02.02 has no such screen to build against.
 *
 * **26 Aug 2026:** the header now shows a real Status badge
 * (`data.user.status`) next to the Membership pill — read-only here on
 * purpose. Suspend/reactivate is a Directory action (bulk-select's own
 * natural home per the Figma spec), not duplicated as a second button on
 * this screen — see UserDirectoryScreen.tsx.
 */
export function UserProfileScreen() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [accessReason, setAccessReason] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-user-detail", id],
    queryFn: () => fetchDetail(id as string),
    enabled: !!id,
  });

  const invalidateDetail = () => queryClient.invalidateQueries({ queryKey: ["admin-user-detail", id] });

  const requestAccessMutation = useMutation({
    mutationFn: (reason: string) =>
      apiClient.post<SensitiveAccessRequestResponse>(`/admin/users/${id}/sensitive-access-requests`, { reason }),
    onSuccess: () => {
      setAccessReason("");
      invalidateDetail();
    },
  });

  const approveAccessMutation = useMutation({
    mutationFn: (requestId: string) => apiClient.post(`/admin/sensitive-access-requests/${requestId}/approve`, {}),
    onSuccess: invalidateDetail,
  });

  const denyAccessMutation = useMutation({
    mutationFn: (requestId: string) => apiClient.post(`/admin/sensitive-access-requests/${requestId}/deny`, {}),
    onSuccess: invalidateDetail,
  });

  const overviewNotAvailable = (data?.notAvailable ?? []).filter((k) => k !== "activity");

  return (
    <AppShell title="User Profile">
      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load this user.")}
          <button type="button" onClick={() => refetch()} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface p-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{data.user.fullName}</h2>
                <span className="rounded-full border border-accent/40 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                  {MEMBERSHIP_LABELS[data.membership]}
                </span>
                <StatusBadge status={data.user.status} />
              </div>
              <div className="mt-1 text-sm text-text-secondary">{data.user.email}</div>
              {data.user.phone && <div className="text-xs text-text-dim">{data.user.phone}</div>}
              <div className="text-[10px] text-text-dim">{data.user.id}</div>
            </div>
            <Link to="/users" className="text-xs text-text-secondary hover:text-text-primary">
              ← Back to Directory
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  tab === t.key
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-subtle text-text-secondary hover:text-text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border-subtle bg-surface p-4">
                  <div className="text-xs uppercase tracking-wide text-text-dim">Profile</div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <Row label="Referral code" value={data.user.referralCode} />
                    <Row label="Joined" value={new Date(data.user.createdAt).toLocaleDateString()} />
                    <Row label="Last updated" value={new Date(data.user.updatedAt).toLocaleDateString()} />
                  </dl>
                </div>

                <div className="rounded-lg border border-border-subtle bg-surface p-4">
                  <div className="text-xs uppercase tracking-wide text-text-dim">Lifetime Value</div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <Row label="Total spent" value={money(data.lifetimeValue.totalSpentCents)} />
                    <Row label="Months active" value={data.lifetimeValue.monthsActive} />
                    <Row label="Avg monthly spend" value={money(data.lifetimeValue.avgMonthlySpendCents)} />
                    <Row
                      label="Payment success rate"
                      value={
                        data.lifetimeValue.paymentSuccessRate == null
                          ? "—"
                          : `${Math.round(data.lifetimeValue.paymentSuccessRate * 100)}%`
                      }
                    />
                  </dl>
                </div>
              </div>

              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-text-dim">Current Subscription</div>
                  {data.currentSubscription && <StatusBadge status={data.currentSubscription.status} />}
                </div>
                {data.currentSubscription ? (
                  <dl className="mt-3 space-y-2 text-sm">
                    <Row label="Plan" value={data.currentSubscription.plan.name} />
                    <Row label="Billing cycle" value={data.currentSubscription.plan.billingCycle} />
                    <Row label="Plan price" value={money(data.currentSubscription.plan.priceCents)} />
                    <Row
                      label="Renews"
                      value={data.currentSubscription.renewsAt ? new Date(data.currentSubscription.renewsAt).toLocaleDateString() : "—"}
                    />
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-text-dim">No subscription — this user is on the Free plan.</p>
                )}
              </div>

              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-text-dim">Recent Activity</div>
                <ul className="mt-3 divide-y divide-border-subtle">
                  {data.recentActivity.map((a) => (
                    <li key={a.id} className="py-2 text-sm">
                      <div className="text-text-primary">{a.action}</div>
                      <div className="text-xs text-text-dim">
                        {a.entityType} · {new Date(a.createdAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                  {data.recentActivity.length === 0 && <li className="py-4 text-center text-sm text-text-dim">No activity yet.</li>}
                </ul>
              </div>

              <NotAvailablePanel
                keys={overviewNotAvailable}
                subtitle="No backing field exists yet for these Figma-spec'd Overview fields — see adminUsers.service.ts."
              />

              <div className="rounded-lg border border-dashed border-border-subtle bg-surface/50 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-dim">
                  🔒 Sensitive Health Metrics
                </div>

                {data.sensitiveAccess.permitted && data.sensitiveHealthMetrics ? (
                  <div className="mt-3">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <Row label="Gender" value={data.sensitiveHealthMetrics.gender ?? "—"} />
                      <Row label="Age" value={data.sensitiveHealthMetrics.age ?? "—"} />
                      <Row label="Weight" value={data.sensitiveHealthMetrics.weightKg != null ? `${data.sensitiveHealthMetrics.weightKg} kg` : "—"} />
                      <Row label="Height" value={data.sensitiveHealthMetrics.heightCm != null ? `${data.sensitiveHealthMetrics.heightCm} cm` : "—"} />
                    </dl>
                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div>
                        <dt className="inline text-text-dim">Allergens: </dt>
                        <dd className="inline text-text-secondary">{data.sensitiveHealthMetrics.allergens.join(", ") || "None recorded"}</dd>
                      </div>
                      <div>
                        <dt className="inline text-text-dim">Medical conditions: </dt>
                        <dd className="inline text-text-secondary">{data.sensitiveHealthMetrics.medicalConditions.join(", ") || "None recorded"}</dd>
                      </div>
                      <div>
                        <dt className="inline text-text-dim">Injuries: </dt>
                        <dd className="inline text-text-secondary">{data.sensitiveHealthMetrics.injuries.join(", ") || "None recorded"}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-[11px] text-text-dim">
                      Visible because your access request was approved — this view is logged in the audit trail.
                    </p>
                  </div>
                ) : !data.sensitiveAccess.canRequest ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Locked — your admin role doesn't carry permission to request access to sensitive health data.
                  </p>
                ) : data.sensitiveAccess.myLatestRequest?.status === "pending" ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Request pending review — submitted {new Date(data.sensitiveAccess.myLatestRequest.createdAt).toLocaleString()}.
                    A different super admin needs to approve it before this panel unlocks for you.
                  </p>
                ) : (
                  <div className="mt-2">
                    <p className="text-xs text-text-secondary">
                      Real data exists on this user's onboarding profile but is locked behind a supervisor-approved,
                      logged access request.
                    </p>
                    {data.sensitiveAccess.myLatestRequest?.status === "denied" && (
                      <p className="mt-2 text-xs text-danger">
                        Your last request was denied
                        {data.sensitiveAccess.myLatestRequest.reviewNotes
                          ? `: "${data.sensitiveAccess.myLatestRequest.reviewNotes}"`
                          : "."}{" "}
                        You can submit a new request below.
                      </p>
                    )}
                    <textarea
                      placeholder="Why do you need access? (required, at least 10 characters)"
                      value={accessReason}
                      onChange={(e) => setAccessReason(e.target.value)}
                      className="mt-2 w-full rounded-md border border-border-subtle bg-surface-raised p-2 text-xs text-text-primary outline-none focus:border-accent"
                      rows={2}
                    />
                    <button
                      type="button"
                      disabled={accessReason.trim().length < 10 || requestAccessMutation.isPending}
                      onClick={() => requestAccessMutation.mutate(accessReason.trim())}
                      className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                    >
                      Request Access
                    </button>
                    {requestAccessMutation.isError && (
                      <p className="mt-2 text-xs text-danger">
                        {extractErrorMessage(requestAccessMutation.error, "Couldn't submit the request.")}
                      </p>
                    )}
                  </div>
                )}

                {data.sensitiveAccess.canReview && data.sensitiveAccess.pendingRequestForReview && (
                  <div className="mt-4 rounded-md border border-warning/30 bg-warning/5 p-3">
                    <p className="text-xs text-text-primary">
                      <span className="font-medium">{data.sensitiveAccess.pendingRequestForReview.requestedByAdminFullName}</span>{" "}
                      requested access — &ldquo;{data.sensitiveAccess.pendingRequestForReview.reason}&rdquo;
                    </p>
                    <p className="mt-1 text-[11px] text-text-dim">
                      {new Date(data.sensitiveAccess.pendingRequestForReview.createdAt).toLocaleString()}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={approveAccessMutation.isPending}
                        onClick={() => approveAccessMutation.mutate(data.sensitiveAccess.pendingRequestForReview!.id)}
                        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-canvas disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={denyAccessMutation.isPending}
                        onClick={() => denyAccessMutation.mutate(data.sensitiveAccess.pendingRequestForReview!.id)}
                        className="rounded-md border border-danger/40 px-3 py-1.5 text-xs text-danger disabled:opacity-40"
                      >
                        Deny
                      </button>
                    </div>
                    {(approveAccessMutation.isError || denyAccessMutation.isError) && (
                      <p className="mt-2 text-xs text-danger">
                        {extractErrorMessage(approveAccessMutation.error ?? denyAccessMutation.error, "That action didn't go through.")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "activity" && <NotAvailablePanel keys={["activity"]} subtitle="See this screen's own doc comment for why." />}

          {tab === "subscription" && (
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">Plan</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal">Billing Cycle</th>
                    <th className="px-4 py-3 font-normal">Renews</th>
                    <th className="px-4 py-3 font-normal">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptions.map((s) => (
                    <tr key={s.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-text-primary">{s.plan.name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{s.plan.billingCycle}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.renewsAt ? new Date(s.renewsAt).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 text-text-secondary">{new Date(s.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.subscriptions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-dim">
                        No subscription history.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "payments" && (
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">Purpose</th>
                    <th className="px-4 py-3 font-normal">Amount</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-text-primary">{PAYMENT_PURPOSE_LABELS[p.purpose] ?? p.purpose}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {money(p.amountCents)} {p.currency}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{new Date(p.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.payments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-text-dim">
                        No payment history.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "relationships" && (
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">Professional</th>
                    <th className="px-4 py-3 font-normal">Service</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {data.relationships.map((r) => (
                    <tr key={r.relationshipId} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{r.professionalFullName}</div>
                        <div className="text-xs text-text-dim">{r.professionalEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{SERVICE_LABELS[r.serviceType] ?? r.serviceType}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.relationships.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-text-dim">
                        No assigned professionals yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "support" && (
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">Subject</th>
                    <th className="px-4 py-3 font-normal">Category</th>
                    <th className="px-4 py-3 font-normal">Priority</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {data.supportTickets.map((t) => (
                    <tr key={t.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-text-primary">{t.subject}</td>
                      <td className="px-4 py-3 text-text-secondary">{t.category}</td>
                      <td className="px-4 py-3 text-text-secondary">{t.priority}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{new Date(t.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {data.supportTickets.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-dim">
                        No support tickets.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
