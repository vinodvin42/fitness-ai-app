import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { apiClient } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

interface InviteAssets {
  inviteCode: string;
  url: string;
  qrPngDataUrl: string;
  live: boolean;
  posterPdfAvailable: boolean;
}

/**
 * Invite members — G-M4's "QR download / print", and G-M5's empty state
 * for a gym with no members yet.
 *
 * DESIGN-PENDING. The QR and the link both come from the server so the
 * lowercase fynrox.app/gym/{code} form (Q4) is spelled in exactly one
 * place.
 */
export function InviteScreen() {
  const invite = useQuery({
    queryKey: ["gymInvite"],
    queryFn: async () => (await apiClient.get<InviteAssets>("/gym-portal/invite")).data,
  });

  if (invite.isLoading) {
    return (
      <AppShell title="Invite members">
        <p className="text-sm text-text-dim">Loading…</p>
      </AppShell>
    );
  }
  if (invite.isError || !invite.data) {
    return (
      <AppShell title="Invite members">
        <p className="text-sm text-danger">{extractErrorMessage(invite.error, "Couldn't load your invite link.")}</p>
      </AppShell>
    );
  }

  const data = invite.data;

  return (
    <AppShell title="Invite members">
      {/* An invite from a gym that isn't approved silently fails when a
          member scans it. Better to say so than to let them print it. */}
      {!data.live ? (
        <p className="mb-5 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          Your partnership isn't active yet, so this link won't work for members. We'll let you know as soon as it
          does — there's no need to reprint anything, the code stays the same.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-8">
        <div className="rounded-lg border border-border-subtle bg-surface p-5">
          <img src={data.qrPngDataUrl} alt={`QR code linking to ${data.url}`} className="h-56 w-56 rounded bg-white p-2" />
          <div className="mt-4 flex gap-2">
            <a
              href={data.qrPngDataUrl}
              download={`fynrox-${data.inviteCode}-qr.png`}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-canvas"
            >
              Download PNG
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
            >
              Print
            </button>
          </div>
          {/* Honest about what isn't built rather than a dead button. */}
          {!data.posterPdfAvailable ? (
            <p className="mt-2 text-[11px] text-text-dim">
              A designed PDF poster isn't available yet — the PNG prints well at A5 or larger.
            </p>
          ) : null}
        </div>

        <div className="min-w-[280px] flex-1">
          <h2 className="text-sm font-semibold text-text-primary">Your invite link</h2>
          <p className="mt-1 break-all rounded-md border border-border-subtle bg-canvas px-3 py-2 font-mono text-sm text-text-primary">
            {data.url}
          </p>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(data.url)}
            className="mt-2 rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Copy link
          </button>

          <h3 className="mt-6 text-sm font-semibold text-text-primary">Invite code</h3>
          <p className="mt-1 font-mono text-lg tracking-widest text-accent">{data.inviteCode}</p>
          <p className="mt-1 text-xs text-text-dim">
            Members can type this in the app if they'd rather not scan.
          </p>

          <p className="mt-6 max-w-sm text-xs text-text-dim">
            Signups through this code are attributed to your gym. You'll see the counts on your dashboard — never a
            member list, and never anything about their training, food or health.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
