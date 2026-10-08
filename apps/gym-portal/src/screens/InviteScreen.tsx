import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const invite = useQuery({
    queryKey: ["gymInvite"],
    queryFn: async () => (await apiClient.get<InviteAssets>("/gym-portal/invite")).data,
  });

  if (invite.isLoading) {
    return (
      <AppShell title={t("nav.invite")}>
        <p className="text-sm text-text-dim">Loading…</p>
      </AppShell>
    );
  }
  if (invite.isError || !invite.data) {
    return (
      <AppShell title={t("nav.invite")}>
        <p className="text-sm text-danger">{extractErrorMessage(invite.error, "Couldn't load your invite link.")}</p>
      </AppShell>
    );
  }

  const data = invite.data;

  return (
    <AppShell title={t("nav.invite")}>
      {/* An invite from a gym that isn't approved silently fails when a
          member scans it. Better to say so than to let them print it. */}
      {!data.live ? (
        <p className="mb-5 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          {t("invite.notActive")}
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
              {t("invite.downloadPng")}
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
              {t("invite.noPdf")}
            </p>
          ) : null}
        </div>

        <div className="min-w-[280px] flex-1">
          <h2 className="text-sm font-semibold text-text-primary">{t("invite.yourLink")}</h2>
          <p className="mt-1 break-all rounded-md border border-border-subtle bg-canvas px-3 py-2 font-mono text-sm text-text-primary">
            {data.url}
          </p>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(data.url)}
            className="mt-2 rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            {t("invite.copyLink")}
          </button>

          <h3 className="mt-6 text-sm font-semibold text-text-primary">{t("invite.inviteCode")}</h3>
          <p className="mt-1 font-mono text-lg tracking-widest text-accent">{data.inviteCode}</p>
          <p className="mt-1 text-xs text-text-dim">
            {t("invite.typeInstead")}
          </p>

          <p className="mt-6 max-w-sm text-xs text-text-dim">
            {t("invite.attributionNote")}
          </p>
        </div>
      </div>
    </AppShell>
  );
}
