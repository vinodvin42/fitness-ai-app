import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface ReferralLink {
  campaignId: string;
  campaignName: string;
  code: string;
  url: string;
  qrPngDataUrl: string;
  live: boolean;
}

interface ReferralTools {
  creatorId: string;
  displayName: string;
  handle: string | null;
  status: string;
  commissionPct: number;
  links: ReferralLink[];
}

/**
 * Creator ID & referral tools. DESIGN-PENDING.
 *
 * Every link is built server-side so Q4's lowercase fynrox.app/r/{code}
 * form is spelled once, and each carries its own `live` flag — a creator
 * who posts a link from a paused campaign to an audience of thousands
 * and gets nothing is a problem worth one boolean.
 */
export function ReferralToolsScreen() {
  const tools = useQuery({
    queryKey: ["creatorReferralTools"],
    queryFn: async () => (await apiClient.get<ReferralTools>("/influencer-portal/referral-tools")).data,
  });

  if (tools.isLoading) {
    return (
      <AppShell title="Referral tools">
        <p className="text-sm text-text-dim">Loading…</p>
      </AppShell>
    );
  }
  if (tools.isError || !tools.data) {
    return (
      <AppShell title="Referral tools">
        <p className="text-sm text-danger">{extractErrorMessage(tools.error, "Couldn't load your referral tools.")}</p>
      </AppShell>
    );
  }

  const t = tools.data;

  return (
    <AppShell title="Referral tools">
      <section className="mb-6 max-w-2xl rounded-lg border border-border-subtle bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">{t.displayName}</h2>
            {t.handle ? <p className="text-xs text-text-dim">{t.handle}</p> : null}
          </div>
          <StatusBadge status={t.status} />
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          You earn {t.commissionPct}% commission on subscriptions that start through your links.
        </p>
      </section>

      {t.links.length === 0 ? (
        <p className="text-sm text-text-dim">
          No campaigns yet — your FynroX contact will set one up and your links will appear here.
        </p>
      ) : (
        <div className="space-y-5">
          {t.links.map((l) => (
            <section key={l.campaignId} className="flex flex-wrap gap-6 rounded-lg border border-border-subtle bg-surface p-5">
              <img
                src={l.qrPngDataUrl}
                alt={`QR code linking to ${l.url}`}
                className="h-40 w-40 rounded bg-white p-2"
              />
              <div className="min-w-[260px] flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">{l.campaignName}</h3>
                  {!l.live ? <StatusBadge status="inactive" /> : null}
                </div>

                {/* Better to say it here than to let them find out from a
                    month of zero conversions. */}
                {!l.live ? (
                  <p className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                    This link isn't live right now, so anyone who follows it sees an unavailable page. Check with your
                    FynroX contact before you post it.
                  </p>
                ) : null}

                <p className="mt-3 break-all rounded-md border border-border-subtle bg-canvas px-3 py-2 font-mono text-sm">
                  {l.url}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(l.url)}
                    className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
                  >
                    Copy link
                  </button>
                  <a
                    href={l.qrPngDataUrl}
                    download={`fynrox-${l.code}-qr.png`}
                    className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
                  >
                    Download QR
                  </a>
                </div>
                <p className="mt-3 text-xs text-text-dim">
                  Code: <span className="font-mono text-accent">{l.code}</span> — people can type this in the app if
                  they'd rather not follow a link.
                </p>
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
