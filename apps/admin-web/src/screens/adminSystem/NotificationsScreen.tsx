import { useQuery } from "@tanstack/react-query";
import type { AdminNotificationsOverviewResponse } from "@fitness-ai-app/types";
import { AppShell } from "../../components/AppShell";
import { StatCard } from "../../components/StatCard";
import { NotAvailablePanel } from "../../components/NotAvailablePanel";
import { apiClient } from "../../lib/api";
import { extractErrorMessage } from "../../lib/apiError";
import { ADMIN_SYSTEM_SUB_NAV } from "./subNav";

const KIND_LABELS: Record<string, string> = {
  reminder: "Reminders",
  workout: "Workouts",
  nutrition: "Nutrition",
  coach: "Coach",
  billing: "Billing",
  system: "System",
};

const PREFERENCE_LABELS: Record<string, string> = {
  masterEnabled: "Notifications on at all",
  workoutReminders: "Workout reminders",
  mealReminders: "Meal reminders",
  hydrationReminders: "Water reminders",
  coachMessages: "Coach messages",
  billing: "Billing",
  marketing: "Offers and news",
};

const CHANNELS: Record<string, { name: string; text: Record<string, string> }> = {
  in_app: { name: "In-app", text: { working: "Working — notifications appear in the app's inbox" } },
  push: {
    name: "Push",
    text: { registration_only: "Phones register for push, but the server doesn't send push messages yet" },
  },
  email: {
    name: "Email",
    text: { configured: "Configured on this server (account emails)", not_configured: "Not configured on this server" },
  },
};

const CHANNEL_TONE: Record<string, string> = {
  working: "bg-accent/15 text-accent",
  configured: "bg-accent/15 text-accent",
  registration_only: "bg-warning/15 text-warning",
  not_configured: "bg-danger/15 text-danger",
};

function pct(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

async function fetchOverview(): Promise<AdminNotificationsOverviewResponse> {
  const res = await apiClient.get<AdminNotificationsOverviewResponse>("/admin/notifications/overview");
  return res.data;
}

/**
 * 12.07 Notifications (docs/admin/03-screen-inventory.md §12.07), Oct 2026 —
 * a read-only view of what the notification system really does (GET
 * /admin/notifications/overview; see adminNotifications.service.ts):
 * in-app notifications by kind and how many were read, which channels work,
 * push devices, and the opt-in rates people chose. Push is shown as
 * "registration only" because the server has no push-sending code yet.
 * Templates, gateway management and broadcasts don't exist, so they're
 * listed as not available instead of mocked.
 */
export function NotificationsScreen() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-notifications-overview"],
    queryFn: fetchOverview,
  });

  const createdTotal = data?.inApp.reduce((sum, k) => sum + k.created, 0) ?? 0;
  const readTotal = data?.inApp.reduce((sum, k) => sum + k.read, 0) ?? 0;

  return (
    <AppShell title="Notifications" subNav={ADMIN_SYSTEM_SUB_NAV}>
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}
        {isError && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {extractErrorMessage(error, "Couldn't load notifications.")}
            <button type="button" onClick={() => refetch()} className="ml-3 underline">
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label={`In-app sent (last ${data.windowDays} days)`} value={createdTotal} />
              <StatCard label="Read" value={`${readTotal} (${pct(createdTotal > 0 ? readTotal / createdTotal : null)})`} />
              <StatCard label="Phones registered for push" value={data.push.devices} hint={`${data.push.usersWithDevice} ${data.push.usersWithDevice === 1 ? "person" : "people"}`} />
              <StatCard label="People on default settings" value={data.preferences.usersOnDefaults} hint="Never changed their notification settings" />
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface shadow-xs p-4">
              <div className="mb-3 text-sm font-medium">Channels</div>
              <ul className="space-y-2">
                {data.channels.map((c) => (
                  <li key={c.channel} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="w-20 font-medium text-text-primary">{CHANNELS[c.channel]?.name ?? c.channel}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${CHANNEL_TONE[c.status] ?? ""}`}>{c.status.replace(/_/g, " ")}</span>
                    <span className="text-xs text-text-secondary">{CHANNELS[c.channel]?.text[c.status] ?? ""}</span>
                  </li>
                ))}
              </ul>
              {data.push.byPlatform.length > 0 && (
                <p className="mt-3 text-xs text-text-dim">
                  Registered phones: {data.push.byPlatform.map((p) => `${p.platform} ${p.devices}`).join(" · ")}
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
                <div className="px-4 pt-4 text-sm font-medium">In-app notifications by kind (last {data.windowDays} days)</div>
                <table className="mt-2 w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-4 py-2 font-normal">Kind</th>
                      <th className="px-4 py-2 font-normal">Sent</th>
                      <th className="px-4 py-2 font-normal">Read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inApp.map((k) => (
                      <tr key={k.kind} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-2 text-text-primary">{KIND_LABELS[k.kind] ?? k.kind}</td>
                        <td className="px-4 py-2 text-text-secondary">{k.created}</td>
                        <td className="px-4 py-2 text-text-secondary">
                          {k.read} <span className="text-text-dim">({pct(k.readRate)})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface shadow-xs">
                <div className="px-4 pt-4 text-sm font-medium">What people chose</div>
                <p className="px-4 text-xs text-text-dim">
                  Among the {data.preferences.usersWithSavedSettings} people who saved their settings.
                </p>
                <table className="mt-2 w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-dim">
                      <th className="px-4 py-2 font-normal">Setting</th>
                      <th className="px-4 py-2 font-normal">On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.preferences.optIns.map((o) => (
                      <tr key={o.field} className="border-b border-border-subtle last:border-0">
                        <td className="px-4 py-2 text-text-primary">{PREFERENCE_LABELS[o.field] ?? o.field}</td>
                        <td className="px-4 py-2 text-text-secondary">
                          {o.on} <span className="text-text-dim">({pct(o.rate)})</span>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-b border-border-subtle">
                      <td className="px-4 py-2 text-text-primary">Quiet hours set</td>
                      <td className="px-4 py-2 text-text-secondary">{data.preferences.quietHoursSet}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-text-primary">Daily limit set</td>
                      <td className="px-4 py-2 text-text-secondary">{data.preferences.frequencyCapSet}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <NotAvailablePanel keys={data.notAvailable} subtitle="These parts of the spec have nothing behind them yet." />
          </>
        )}
      </div>
    </AppShell>
  );
}
