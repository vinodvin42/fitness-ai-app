import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type {
  AdminSubscriptionDirectoryResponse,
  AdminSubscriptionListItem,
  BillingCycle,
  SubscriptionStatus,
  SubscriptionTier,
} from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { StatusBadge } from "../../components/StatusBadge";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { ReasonGatedAction } from "../../components/ReasonGatedAction";
import { useCan } from "../../lib/permissions";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { COMMERCE_SUB_NAV } from "./subNav";

const STATUSES: SubscriptionStatus[] = ["active", "trialing", "pending", "past_due", "suspended", "canceled", "expired", "revoked"];
const TIERS: SubscriptionTier[] = ["basic", "grow", "prime"];
const CYCLES: BillingCycle[] = ["monthly", "quarterly", "annual"];
const CYCLE_LABELS: Record<BillingCycle, string> = { monthly: "Monthly", quarterly: "Every 3 months", annual: "Yearly" };

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

function label(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

interface Filters {
  status: SubscriptionStatus | "";
  tier: SubscriptionTier | "";
  billingCycle: BillingCycle | "";
  search: string;
}

async function fetchSubscriptions(filters: Filters): Promise<AdminSubscriptionDirectoryResponse> {
  const res = await apiClient.get<AdminSubscriptionDirectoryResponse>("/admin/subscriptions", {
    params: {
      status: filters.status || undefined,
      tier: filters.tier || undefined,
      billingCycle: filters.billingCycle || undefined,
      search: filters.search || undefined,
    },
  });
  return res.data;
}

const SELECT_CLASS =
  "rounded-md border border-border-subtle bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent";

/**
 * 06.01 Subscriptions (docs/admin/03-screen-inventory.md §06.01), Oct 2026 —
 * every user's subscription over the real `Subscription` + `SubscriptionPlan`
 * rows (GET /admin/subscriptions; see adminSubscriptions.service.ts). The
 * spec's revenue waterfall already lives at Finance → Revenue waterfall, so
 * this screen is the list the spec's "Subscriptions" tab names. Price shows
 * the subscriber's locked price when there is one. Revoking or restoring a
 * subscription is also on the user's profile. The KPI row counts all
 * subscriptions, not just the filtered ones.
 *
 * Oct 2026 (admin audit item 2): each row has Manage for roles with
 * commerce:approve: suspend or reactivate (reason + typed RESOLVE, which the
 * API checks) and revoke or restore (reason). Only the actions the row's
 * status allows are offered (subscriptions.service.ts has the same rules).
 */
export function SubscriptionsScreen() {
  const [filters, setFilters] = useState<Filters>({ status: "", tier: "", billingCycle: "", search: "" });
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-subscriptions", filters],
    queryFn: () => fetchSubscriptions(filters),
  });

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
  const canManage = useCan("commerce", "approve");
  const [managing, setManaging] = useState<string | null>(null);

  return (
    <AppShell title="Subscriptions" subNav={COMMERCE_SUB_NAV}>
      <div className="space-y-4">
        {data && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Active" value={data.counts.active} />
            <StatCard label="Trialing" value={data.counts.trialing} />
            <StatCard label="Past due" value={data.counts.past_due} />
            <StatCard label="Suspended or revoked" value={data.counts.suspended + data.counts.revoked} />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle bg-surface p-4">
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Status
            <select value={filters.status} onChange={(e) => setFilter("status", e.target.value as Filters["status"])} className={SELECT_CLASS}>
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Plan
            <select value={filters.tier} onChange={(e) => setFilter("tier", e.target.value as Filters["tier"])} className={SELECT_CLASS}>
              <option value="">All</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Billing
            <select
              value={filters.billingCycle}
              onChange={(e) => setFilter("billingCycle", e.target.value as Filters["billingCycle"])}
              className={SELECT_CLASS}
            >
              <option value="">All</option>
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {CYCLE_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="ml-auto flex flex-col gap-1 text-xs text-text-dim">
            Search
            <input
              type="search"
              placeholder="User name or email…"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              className={`w-64 ${SELECT_CLASS}`}
            />
          </label>
        </div>

        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load subscriptions.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            <p className="text-xs text-text-dim">
              {data.matched} matching subscription{data.matched === 1 ? "" : "s"}
              {data.truncated ? ` — showing the newest ${data.subscriptions.length}` : ""}.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-4 py-3 font-normal">User</th>
                    <th className="px-4 py-3 font-normal">Plan</th>
                    <th className="px-4 py-3 font-normal">Price</th>
                    <th className="px-4 py-3 font-normal">Status</th>
                    <th className="px-4 py-3 font-normal">Renews / ends</th>
                    <th className="px-4 py-3 font-normal">Started</th>
                    <th className="px-4 py-3 font-normal">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptions.map((s) => (
                    <Fragment key={s.id}>
                    <tr className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{s.user.fullName}</div>
                        <div className="text-xs text-text-dim">
                          {s.user.email}
                          {s.user.countryCode ? ` · ${s.user.countryCode}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-text-secondary">{s.plan.name}</div>
                        <div className="text-xs text-text-dim">
                          {label(s.plan.tier)} · {CYCLE_LABELS[s.plan.billingCycle]}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {money(s.priceCents)}
                        {s.priceLocked && (
                          <span
                            className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-text-dim"
                            title={`Locked subscriber price; the plan is now ${money(s.plan.priceCents)}`}
                          >
                            Locked
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                        {s.cancelAtPeriodEnd && <div className="mt-1 text-[11px] text-warning">Cancels at period end</div>}
                        {s.revokedReason && <div className="mt-1 max-w-[16rem] truncate text-[11px] text-text-dim" title={s.revokedReason}>{s.revokedReason}</div>}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{s.renewsAt ? new Date(s.renewsAt).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 text-text-secondary">{new Date(s.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Link to={`/users/${s.user.id}`} className="text-xs text-accent hover:underline">
                            View user
                          </Link>
                          {canManage && availableActions(s.status).length > 0 && (
                            <button
                              type="button"
                              onClick={() => setManaging(managing === s.id ? null : s.id)}
                              aria-expanded={managing === s.id}
                              className="text-xs text-text-secondary hover:text-text-primary hover:underline"
                            >
                              {managing === s.id ? "Close" : "Manage"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {managing === s.id && (
                      <tr className="border-b border-border-subtle bg-surface-raised/40">
                        <td colSpan={7} className="px-4 py-3">
                          <SubscriptionActions subscription={s} onDone={() => setManaging(null)} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                  {data.subscriptions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-text-dim">
                        No subscriptions match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.byCountry.length > 0 && (
              <div className="rounded-lg border border-border-subtle bg-surface p-4">
                <div className="text-xs uppercase tracking-wide text-text-dim">Giving access now, by country</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.byCountry.map((c) => (
                    <span key={c.countryCode ?? "none"} className="rounded-full bg-surface-raised px-3 py-1 text-xs text-text-secondary">
                      {c.countryCode ?? "Not set"} · {c.count}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <NotAvailablePanel keys={data.notAvailable} />
          </>
        )}
      </div>
    </AppShell>
  );
}

type SubscriptionAction = "suspend" | "reactivate" | "revoke" | "unrevoke";

/** What subscriptions.service.ts allows from each status. */
function availableActions(status: SubscriptionStatus): SubscriptionAction[] {
  if (status === "active" || status === "trialing" || status === "past_due") return ["suspend", "revoke"];
  if (status === "suspended") return ["reactivate", "revoke"];
  if (status === "pending") return ["revoke"];
  if (status === "revoked") return ["unrevoke"];
  return [];
}

const ACTION_COPY: Record<SubscriptionAction, { title: string; description: string; label: string; tone: "danger" | "warning"; confirm?: string }> = {
  suspend: {
    title: "Suspend subscription",
    description: "Pauses access straight away. It can be reactivated later. The member isn't refunded by this.",
    label: "Suspend",
    tone: "warning",
    confirm: "RESOLVE",
  },
  reactivate: {
    title: "Reactivate subscription",
    description: "Gives access back, with the status it had before it was suspended.",
    label: "Reactivate",
    tone: "warning",
    confirm: "RESOLVE",
  },
  revoke: {
    title: "Revoke subscription",
    description: "Ends access now. It can be restored later from here or the user's profile. The member isn't refunded by this.",
    label: "Revoke",
    tone: "danger",
  },
  unrevoke: {
    title: "Restore revoked subscription",
    description: "Gives access back, with the status it had before it was revoked.",
    label: "Restore",
    tone: "warning",
  },
};

function SubscriptionActions({ subscription, onDone }: { subscription: AdminSubscriptionListItem; onDone: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ action, reason, confirmation }: { action: SubscriptionAction; reason: string; confirmation?: string }) =>
      apiClient.post(`/admin/subscriptions/${subscription.id}/${action}`, confirmation ? { reason, confirmation } : { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      onDone();
    },
  });
  const actions = availableActions(subscription.status);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {actions.map((action) => {
        const copy = ACTION_COPY[action];
        return (
          <ReasonGatedAction
            key={action}
            title={`${copy.title} · ${subscription.user.fullName}`}
            description={copy.description}
            actionLabel={copy.label}
            tone={copy.tone}
            confirmWord={copy.confirm}
            isPending={mutation.isPending && mutation.variables?.action === action}
            isError={mutation.isError && mutation.variables?.action === action}
            error={mutation.error}
            onConfirm={(reason, confirmation) => mutation.mutate({ action, reason, confirmation })}
          />
        );
      })}
    </div>
  );
}
