import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import type { AdminGymMemberActivationSummary, GymPortalProfileResponse } from "@fitness-ai-app/types";
import { AppShell } from "../components/AppShell";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

async function fetchProfile(): Promise<GymPortalProfileResponse> {
  const res = await apiClient.get<GymPortalProfileResponse>("/gym-portal/me");
  return res.data;
}

async function fetchMemberActivationSummary(): Promise<AdminGymMemberActivationSummary> {
  const res = await apiClient.get<AdminGymMemberActivationSummary>("/gym-portal/member-activation-summary");
  return res.data;
}

/**
 * Gym Partner Lite portal dashboard (R2 Wave 5, 21 Sep 2026) — the real
 * screen this wave's work package names: "Organization and location
 * profile", "Unique QR/invite/link access", "Invited members/activated
 * members... First-workout and privacy-safe activity/re-entry indicators",
 * "Pilot/commercial status summary". Both queries hit the new gym-authed
 * wrapper routes in gyms.routes.ts (`GET /gym-portal/me`, `GET
 * /gym-portal/member-activation-summary`), which reuse
 * gyms.service.ts#getGymDetail/getMemberActivationSummary exactly — no new
 * aggregation logic lives in this app.
 *
 * BR-GYM-003: the member-activation-summary response is aggregate counts
 * only (memberCount/onboardingCompletedCount/firstWorkoutCompletedCount) —
 * this screen has no member list, no per-member data, and no way to reach
 * one — see gyms.service.ts#getMemberActivationSummary's own doc comment
 * for the same boundary enforced server-side.
 *
 * The invite code is rendered as a real QR code client-side using the
 * `qrcode` package — already a real dependency of apps/api (see
 * lib/twoFactor.ts's TOTP-setup QR), reused here rather than introducing a
 * second QR library into this build. Encodes the exact deep-link shape
 * apps/user-mobile's acquisitionContext.ts already expects
 * (`fynrox://join?source=gym&code=<code>`) — see gyms.service.ts's own
 * doc comment on the invite code for why that string, not a bare code, is
 * what's meaningful to scan.
 */
export function DashboardScreen() {
  const { t } = useTranslation();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["gym-portal-me"],
    queryFn: fetchProfile,
  });

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["gym-portal-member-activation-summary"],
    queryFn: fetchMemberActivationSummary,
  });

  useEffect(() => {
    if (!data?.gym.inviteCode) {
      setQrDataUrl(null);
      return;
    }
    const deepLink = `fynrox://join?source=gym&code=${data.gym.inviteCode}`;
    let cancelled = false;
    QRCode.toDataURL(deepLink, { margin: 1, width: 200 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.gym.inviteCode]);

  return (
    <AppShell title={t("nav.dashboard")}>
      {isLoading && <p className="text-sm text-text-secondary">Loading…</p>}

      {isError && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {extractErrorMessage(error, "Couldn't load your gym profile.")}
          <button type="button" onClick={() => refetch()} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{data.gym.name}</h2>
              <StatusBadge status={data.gym.status} />
            </div>
            <div className="mt-1 text-sm text-text-secondary">
              {data.gym.contactName} · {data.gym.contactEmail}
            </div>
            {data.gym.contactPhone && <div className="text-xs text-text-dim">{data.gym.contactPhone}</div>}
            {data.gym.status === "application" && (
              <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                {t("dashboard.underReview")}
              </p>
            )}
            {data.gym.status === "suspended" && (
              <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
                {t("dashboard.suspended")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Invite code / QR — "Unique QR/invite/link access" */}
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("dashboard.memberInvite")}</div>
              <p className="mt-2 text-sm text-text-secondary">
                {t("dashboard.shareCode")}
              </p>
              <div className="mt-3 flex items-center gap-4">
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for invite code ${data.gym.inviteCode}`}
                    className="h-32 w-32 rounded-md bg-white p-1.5"
                  />
                )}
                <div>
                  <div className="text-[11px] text-text-dim">{t("dashboard.inviteCode")}</div>
                  <div className="font-mono text-lg tracking-wider text-text-primary">{data.gym.inviteCode}</div>
                </div>
              </div>
            </div>

            {/* Member activation summary — "First-workout and privacy-safe
                activity/re-entry indicators". Aggregate counts only. */}
            <div className="rounded-lg border border-border-subtle bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-dim">{t("dashboard.memberActivity")}</div>
              {isSummaryLoading && <p className="mt-3 text-sm text-text-secondary">Loading…</p>}
              {summary && (
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label={t("dashboard.membersJoined")} value={summary.memberCount} />
                  <Row label={t("dashboard.onboardingCompleted")} value={summary.onboardingCompletedCount} />
                  <Row label={t("dashboard.firstWorkout")} value={summary.firstWorkoutCompletedCount} />
                </dl>
              )}
              <p className="mt-3 text-[11px] text-text-dim">
                {t("dashboard.aggregateNote")}
              </p>
            </div>
          </div>

          {/* Locations — "Organization and location profile" */}
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-text-dim">
              Your Locations ({data.gym.locations.length})
            </div>
            <div className="mt-3 space-y-2">
              {data.gym.locations.map((l) => (
                <div key={l.id} className="rounded-md border border-border-subtle p-3">
                  <div className="font-medium text-text-primary">{l.name}</div>
                  <div className="text-xs text-text-secondary">{l.address}</div>
                  {l.equipment && <div className="mt-1 text-xs text-text-dim">{l.equipment}</div>}
                </div>
              ))}
              {data.gym.locations.length === 0 && (
                <p className="text-sm text-text-dim">
                  {t("dashboard.noLocations")}
                </p>
              )}
            </div>
          </div>

          {/* Pilot/commercial status summary — trimmed to a plain boolean,
              never the raw negotiated commission/rate figures (see
              gyms.routes.ts's own comment on why this route trims those). */}
          <div className="rounded-lg border border-border-subtle bg-surface p-4">
            <div className="text-xs uppercase tracking-wide text-text-dim">{t("dashboard.commercialStatus")}</div>
            <p className="mt-2 text-sm text-text-secondary">
              {data.gym.commercialConfigured
                ? "Your commercial terms are configured. Contact your Fynrox account manager for details."
                : "Commercial terms have not been configured yet — reach out to your Fynrox account manager."}
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-dim">{label}</dt>
      <dd className="text-right text-text-secondary">{value}</dd>
    </div>
  );
}
